// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title Corpus
 * @notice A dataset that pays its contributors. Agents bond MON and submit
 *         content-addressed data; a scorer mints royalty shares proportional to how
 *         much new information each record adds; buyers pay for access and that
 *         revenue flows to shareholders forever after.
 *
 *         The shares are a claim on real revenue, not points — which is what makes
 *         the incentives hard to farm. Minting is never free (a slice of every bond
 *         is paid to the holders the new shares dilute) and rejected work forfeits
 *         its whole bond to those same holders.
 *
 *         Trust model: the scorer is a single trusted oracle in this version. It
 *         cannot take funds, but it decides what is worth minting. Contributors are
 *         protected against a scorer that disappears (reclaimBond), not against one
 *         that is actively hostile — that needs staked or optimistic scoring.
 *
 *         All payouts are pull-based: nothing in this contract pushes value to an
 *         address during a user's state-changing call.
 */
contract Corpus {
    enum Status { Pending, Scored, Rejected, Expired }

    struct Submission {
        address contributor;
        bytes32 contentHash;
        string uri;
        uint96 bond;
        uint40 submittedAt;
        uint16 score;
        Status status;
    }

    uint256 private constant MAG = 2 ** 128;
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant SHARES_PER_SCORE = 1e15; // score 1000 => exactly 1.0 share
    uint256 public constant MINT_FEE_BPS = 2000; // 20% of bond, non-refundable on accept
    uint256 public constant RECLAIM_FEE_BPS = 500; // 5% on timeout reclaim
    uint256 public constant PROTOCOL_BPS = 1000;
    uint256 public constant CURATOR_BPS = 2000;
    uint40 public constant PAUSE_WINDOW = 24 hours;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    string public schemaURI;

    address public immutable scorer;
    address public immutable curator;
    address public immutable protocolTreasury;
    uint96 public immutable bondAmount;
    uint96 public immutable accessPrice;
    uint40 public immutable scoreTimeout;
    uint40 public immutable accessDuration;

    Submission[] private submissions;
    mapping(bytes32 => bool) public contentSeen;
    /// @dev A freed hash stays bound to whoever first submitted it, so an expired
    ///      or rejected record cannot be re-submitted by someone who merely watched
    ///      the event and copied the hash.
    mapping(bytes32 => address) public contentOwner;
    mapping(address => uint32) public pendingOf;
    uint256 public scoredCount;

    mapping(address => uint256) public credits;
    mapping(address => uint40) public accessUntil;
    uint40 public pausedUntil;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 private magnifiedDividendPerShare;
    mapping(address => int256) private magnifiedCorrections;
    mapping(address => uint256) public withdrawnDividends;

    event SubmissionReceived(uint256 indexed id, address indexed contributor, bytes32 contentHash, string uri);
    event ScorePosted(uint256 indexed id, address indexed contributor, uint16 score, uint256 shares, string reason);
    event Slashed(uint256 indexed id, address indexed contributor, uint256 amount, string reason);
    event BondReclaimed(uint256 indexed id, address indexed contributor, uint256 refund);
    event AccessPurchased(address indexed buyer, uint256 price, uint40 accessUntil);
    event DividendsDistributed(uint256 amount, uint256 effectiveSupply);
    event DividendsClaimed(address indexed holder, uint256 amount);
    event CreditsWithdrawn(address indexed account, uint256 amount);
    event Paused(uint40 until);
    event Unpaused();
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error OnlyScorer();
    error OnlyCurator();
    error OnlyContributor();
    error DuplicateContent();
    error NotContentOwner();
    error TooManyPending();
    error WrongBond();
    error WrongPrice();
    error NotPending();
    error ScoreOutOfRange();
    error TimeoutNotReached();
    error NoDataYet();
    error NothingToClaim();
    error TransferFailed();
    error IsPaused();
    error PauseCooldown();
    error InvalidRecipient();
    error InsufficientBalance();

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _schemaURI,
        address _scorer,
        address _curator,
        address _protocolTreasury,
        uint96 _bondAmount,
        uint96 _accessPrice,
        uint40 _scoreTimeout,
        uint40 _accessDuration
    ) {
        name = _name;
        symbol = _symbol;
        schemaURI = _schemaURI;
        scorer = _scorer;
        curator = _curator;
        protocolTreasury = _protocolTreasury;
        bondAmount = _bondAmount;
        accessPrice = _accessPrice;
        scoreTimeout = _scoreTimeout;
        accessDuration = _accessDuration;
    }

    modifier onlyScorer() {
        if (msg.sender != scorer) revert OnlyScorer();
        _;
    }

    modifier whenNotPaused() {
        if (block.timestamp < pausedUntil) revert IsPaused();
        _;
    }

    // ---------------------------------------------------------------- contribute

    function submit(bytes32 contentHash, string calldata uri) external payable whenNotPaused returns (uint256 id) {
        if (msg.value != bondAmount) revert WrongBond();
        if (contentSeen[contentHash]) revert DuplicateContent();
        address owner = contentOwner[contentHash];
        if (owner != address(0) && owner != msg.sender) revert NotContentOwner();
        if (pendingOf[msg.sender] >= 5) revert TooManyPending();

        contentSeen[contentHash] = true;
        if (owner == address(0)) contentOwner[contentHash] = msg.sender;
        unchecked {
            pendingOf[msg.sender] += 1;
        }

        id = submissions.length;
        submissions.push(
            Submission({
                contributor: msg.sender,
                contentHash: contentHash,
                uri: uri,
                bond: uint96(msg.value),
                submittedAt: uint40(block.timestamp),
                score: 0,
                status: Status.Pending
            })
        );
        emit SubmissionReceived(id, msg.sender, contentHash, uri);
    }

    /**
     * @notice Records the scorer's verdict. A zero score forfeits the bond to the
     *         holders; a positive score mints shares and returns the bond less the
     *         mint fee.
     */
    function postScore(uint256 id, uint16 score, string calldata reason) external onlyScorer {
        Submission storage s = submissions[id];
        if (s.status != Status.Pending) revert NotPending();
        if (score > MAX_SCORE) revert ScoreOutOfRange();

        address contributor = s.contributor;
        uint256 bond = s.bond;
        unchecked {
            pendingOf[contributor] -= 1;
        }

        if (score == 0) {
            s.status = Status.Rejected;
            contentSeen[s.contentHash] = false;
            // The rejected contributor is excluded so they cannot recover their own
            // slash through shares they already hold.
            _distributeOrRefund(bond, contributor, contributor);
            emit Slashed(id, contributor, bond, reason);
            return;
        }

        s.status = Status.Scored;
        s.score = score;
        unchecked {
            scoredCount += 1;
        }

        uint256 mintFee = (bond * MINT_FEE_BPS) / 10_000;
        uint256 shares = uint256(score) * SHARES_PER_SCORE;

        // Ordering matters: the fee is paid to the holders who existed *before* this
        // mint, otherwise the new shares would collect a slice of their own fee.
        _distributeOrRefund(mintFee, address(0), contributor);
        _mint(contributor, shares);

        credits[contributor] += bond - mintFee;
        emit ScorePosted(id, contributor, score, shares, reason);
    }

    /// @notice Escape hatch if the scorer never responds: the bond comes back.
    function reclaimBond(uint256 id) external {
        Submission storage s = submissions[id];
        if (msg.sender != s.contributor) revert OnlyContributor();
        if (s.status != Status.Pending) revert NotPending();
        if (block.timestamp <= uint256(s.submittedAt) + scoreTimeout) revert TimeoutNotReached();

        s.status = Status.Expired;
        contentSeen[s.contentHash] = false;
        unchecked {
            pendingOf[msg.sender] -= 1;
        }

        uint256 bond = s.bond;
        uint256 fee = (bond * RECLAIM_FEE_BPS) / 10_000;
        credits[msg.sender] += bond - fee;
        _distributeOrRefund(fee, address(0), msg.sender);
        emit BondReclaimed(id, msg.sender, bond - fee);
    }

    // ---------------------------------------------------------------------- buy

    function buyAccess() external payable whenNotPaused {
        if (msg.value != accessPrice) revert WrongPrice();
        if (scoredCount == 0) revert NoDataYet();

        uint40 current = accessUntil[msg.sender];
        uint40 start = current > uint40(block.timestamp) ? current : uint40(block.timestamp);
        uint40 until = start + accessDuration;
        accessUntil[msg.sender] = until;

        uint256 protocolCut = (msg.value * PROTOCOL_BPS) / 10_000;
        uint256 curatorCut = (msg.value * CURATOR_BPS) / 10_000;
        credits[protocolTreasury] += protocolCut;
        credits[curator] += curatorCut;
        // Any rounding remainder stays with the holders rather than becoming dust.
        _distributeOrRefund(msg.value - protocolCut - curatorCut, address(0), curator);

        emit AccessPurchased(msg.sender, msg.value, until);
    }

    function hasAccess(address account) external view returns (bool) {
        return accessUntil[account] > block.timestamp;
    }

    // ------------------------------------------------------------------- payouts

    function withdrawableDividendOf(address account) public view returns (uint256) {
        // Sum in signed magnified space and divide exactly once.
        uint256 accumulative =
            uint256(int256(magnifiedDividendPerShare * balanceOf[account]) + magnifiedCorrections[account]) / MAG;
        return accumulative - withdrawnDividends[account];
    }

    function claimDividends() external {
        uint256 amount = withdrawableDividendOf(msg.sender);
        if (amount == 0) revert NothingToClaim();
        withdrawnDividends[msg.sender] += amount;
        emit DividendsClaimed(msg.sender, amount);
        _send(msg.sender, amount);
    }

    function withdrawCredits() external {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToClaim();
        credits[msg.sender] = 0;
        emit CreditsWithdrawn(msg.sender, amount);
        _send(msg.sender, amount);
    }

    function creditsOf(address account) external view returns (uint256) {
        return credits[account];
    }

    // -------------------------------------------------------------------- pause

    /// @dev Auto-expires so the curator cannot freeze the market indefinitely, and
    ///      cannot be renewed until the previous window has fully elapsed. Claims and
    ///      withdrawals are never pausable.
    function pause() external {
        if (msg.sender != curator) revert OnlyCurator();
        if (block.timestamp <= uint256(pausedUntil) + PAUSE_WINDOW) revert PauseCooldown();
        pausedUntil = uint40(block.timestamp) + PAUSE_WINDOW;
        emit Paused(pausedUntil);
    }

    function unpause() external {
        if (msg.sender != curator) revert OnlyCurator();
        pausedUntil = 0;
        emit Unpaused();
    }

    function paused() external view returns (bool) {
        return block.timestamp < pausedUntil;
    }

    // -------------------------------------------------------------------- views

    function submissionCount() external view returns (uint256) {
        return submissions.length;
    }

    function getSubmission(uint256 id) external view returns (Submission memory) {
        return submissions[id];
    }

    /// @dev Clamps rather than reverting so a polling dashboard can ask for more
    ///      than exists without special-casing.
    function getSubmissions(uint256 offset, uint256 limit) external view returns (Submission[] memory page) {
        uint256 total = submissions.length;
        if (offset >= total) return new Submission[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new Submission[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = submissions[i];
        }
    }

    // ----------------------------------------------------------------- internals

    /**
     * @dev Distributes to holders, excluding one address from this round if asked.
     *      When there is nobody to pay — an empty corpus, or the excluded holder owns
     *      everything — the money is refunded instead of divided, so no path can
     *      divide by zero and no value is ever stranded.
     */
    function _distributeOrRefund(uint256 amount, address excluded, address refundTo) private {
        if (amount == 0) return;
        uint256 effectiveSupply = totalSupply;
        if (excluded != address(0)) effectiveSupply -= balanceOf[excluded];

        if (effectiveSupply == 0) {
            credits[refundTo] += amount;
            return;
        }

        uint256 deltaPerShare = (amount * MAG) / effectiveSupply;
        magnifiedDividendPerShare += deltaPerShare;
        if (excluded != address(0)) {
            magnifiedCorrections[excluded] -= int256(deltaPerShare * balanceOf[excluded]);
        }
        emit DividendsDistributed(amount, effectiveSupply);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        // New shares carry no claim on revenue that was already distributed.
        magnifiedCorrections[to] -= int256(magnifiedDividendPerShare * amount);
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientBalance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        if (from == to) return; // no-op, and never a read-modify-write that inflates a balance

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        // Dividends already earned stay with the sender; the receiver's claim starts now.
        int256 shift = int256(magnifiedDividendPerShare * amount);
        magnifiedCorrections[from] += shift;
        magnifiedCorrections[to] -= shift;
        emit Transfer(from, to, amount);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
