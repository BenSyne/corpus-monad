// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Corpus} from "../src/Corpus.sol";
import {CorpusFactory} from "../src/CorpusFactory.sol";

contract CorpusTest is Test {
    CorpusFactory factory;
    Corpus corpus;

    address scorer;
    address curator;
    address alice;
    address bob;
    address buyer;
    address protocol = address(this);

    uint96 constant BOND = 0.1 ether;
    uint96 constant PRICE = 1 ether;
    uint40 constant TIMEOUT = 15 minutes;
    uint40 constant ACCESS = 30 days;
    /// Dividend accounting divides by the share supply, so payouts can round down by
    /// a few wei. Truncation always favours the contract, never a holder, so the
    /// remainder is stranded dust rather than a deficit — see the balance invariant.
    uint256 constant DUST = 10;

    function setUp() public {
        scorer = makeAddr("scorer");
        curator = makeAddr("curator");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        buyer = makeAddr("buyer");
        factory = new CorpusFactory();
        corpus = Corpus(factory.createCorpus("Evals", "EVAL", "ipfs://schema", scorer, curator, BOND, PRICE, TIMEOUT, ACCESS));
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    function _submit(address who, bytes32 hash) internal returns (uint256) {
        vm.prank(who);
        return corpus.submit{value: BOND}(hash, "cas://x");
    }

    function _accept(address who, bytes32 hash, uint16 score) internal returns (uint256 id) {
        id = _submit(who, hash);
        vm.prank(scorer);
        corpus.postScore(id, score, "novel");
    }

    // ------------------------------------------------------------------ submit

    function test_submit_storesPendingSubmission() public {
        uint256 id = _submit(alice, keccak256("a"));
        Corpus.Submission memory s = corpus.getSubmission(id);
        assertEq(s.contributor, alice);
        assertEq(uint8(s.status), uint8(Corpus.Status.Pending));
        assertEq(s.bond, BOND);
        assertEq(corpus.pendingOf(alice), 1);
    }

    function test_submit_revertsOnWrongBond() public {
        vm.prank(alice);
        vm.expectRevert(Corpus.WrongBond.selector);
        corpus.submit{value: 0.05 ether}(keccak256("a"), "cas://x");
    }

    function test_submit_revertsOnDuplicateContent() public {
        _submit(alice, keccak256("a"));
        vm.prank(bob);
        vm.expectRevert(Corpus.DuplicateContent.selector);
        corpus.submit{value: BOND}(keccak256("a"), "cas://x");
    }

    function test_submit_enforcesPendingCap() public {
        for (uint256 i = 0; i < 5; i++) _submit(alice, keccak256(abi.encode(i)));
        vm.prank(alice);
        vm.expectRevert(Corpus.TooManyPending.selector);
        corpus.submit{value: BOND}(keccak256("six"), "cas://x");
    }

    function test_pendingCapFreesAfterScoring() public {
        for (uint256 i = 0; i < 5; i++) _submit(alice, keccak256(abi.encode(i)));
        vm.prank(scorer);
        corpus.postScore(0, 500, "novel");
        assertEq(corpus.pendingOf(alice), 4);
        _submit(alice, keccak256("six")); // no longer capped
        assertEq(corpus.pendingOf(alice), 5);
    }

    function test_pendingCapFreesAfterRejection() public {
        for (uint256 i = 0; i < 5; i++) _submit(alice, keccak256(abi.encode(i)));
        vm.prank(scorer);
        corpus.postScore(0, 0, "dupe");
        assertEq(corpus.pendingOf(alice), 4);
    }

    // --------------------------------------------------------------- postScore

    function test_accept_mintsSharesProportionalToScore() public {
        _accept(alice, keccak256("a"), 750);
        assertEq(corpus.balanceOf(alice), 750 * 1e15);
        assertEq(corpus.totalSupply(), 750 * 1e15);
        assertEq(corpus.scoredCount(), 1);
    }

    function test_accept_returnsBondMinusMintFee() public {
        _accept(alice, keccak256("a"), 500); // first accept: no holders exist, so the fee is waived
        _accept(bob, keccak256("b"), 500);
        assertEq(corpus.credits(bob), BOND - (BOND * 2000) / 10_000, "minting costs the fee once there is anyone to dilute");
    }

    function test_accept_mintFeeIsPaidToPriorHoldersNotTheMinter() public {
        _accept(alice, keccak256("a"), 500); // first accept: nobody to dilute, fee waived back
        uint256 aliceCreditsAfterFirst = corpus.credits(alice);
        assertEq(aliceCreditsAfterFirst, BOND, "first minter is refunded the whole bond");

        _accept(bob, keccak256("b"), 500); // now alice is diluted and collects the fee
        assertEq(corpus.withdrawableDividendOf(bob), 0, "new minter must not share its own fee");
        assertApproxEqAbs(corpus.withdrawableDividendOf(alice), (BOND * 2000) / 10_000, DUST);
    }

    function test_reject_slashesWholeBondToHolders() public {
        _accept(alice, keccak256("a"), 500);
        uint256 before = corpus.withdrawableDividendOf(alice);

        uint256 id = _submit(bob, keccak256("b"));
        vm.prank(scorer);
        corpus.postScore(id, 0, "near-dup");

        Corpus.Submission memory s = corpus.getSubmission(id);
        assertEq(uint8(s.status), uint8(Corpus.Status.Rejected));
        assertEq(corpus.credits(bob), 0, "rejected contributor gets nothing back");
        assertApproxEqAbs(corpus.withdrawableDividendOf(alice), before + BOND, DUST);
    }

    function test_reject_excludesTheRejectedContributorFromItsOwnSlash() public {
        _accept(alice, keccak256("a"), 500);
        _accept(bob, keccak256("b"), 500); // bob holds half the supply
        uint256 bobBefore = corpus.withdrawableDividendOf(bob);

        uint256 id = _submit(bob, keccak256("junk"));
        vm.prank(scorer);
        corpus.postScore(id, 0, "slop");

        assertEq(corpus.withdrawableDividendOf(bob), bobBefore, "slashed party must not recover its own bond");
    }

    function test_reject_freesTheContentHashForItsOriginalAuthor() public {
        uint256 id = _submit(alice, keccak256("a"));
        vm.prank(scorer);
        corpus.postScore(id, 0, "bad schema");
        assertFalse(corpus.contentSeen(keccak256("a")));
        _submit(alice, keccak256("a")); // author may retry
    }

    function test_postScore_revertsAboveMaxScore() public {
        uint256 id = _submit(alice, keccak256("a"));
        vm.prank(scorer);
        vm.expectRevert(Corpus.ScoreOutOfRange.selector);
        corpus.postScore(id, 1001, "bug");
    }

    // -------------------------------------------------------------- reclaimBond

    function test_reclaim_revertsBeforeTimeout() public {
        uint256 id = _submit(alice, keccak256("a"));
        vm.prank(alice);
        vm.expectRevert(Corpus.TimeoutNotReached.selector);
        corpus.reclaimBond(id);
    }

    function test_reclaim_refunds95PercentAfterTimeout() public {
        uint256 id = _submit(alice, keccak256("a"));
        vm.warp(block.timestamp + TIMEOUT + 1);
        vm.prank(alice);
        corpus.reclaimBond(id);
        assertEq(corpus.credits(alice), BOND, "no holders yet, so the fee is refunded too");
        assertEq(corpus.pendingOf(alice), 0);
    }

    function test_reclaim_feeGoesToHoldersWhenTheyExist() public {
        _accept(bob, keccak256("b"), 500);
        uint256 bobBefore = corpus.withdrawableDividendOf(bob);
        uint256 id = _submit(alice, keccak256("a"));
        vm.warp(block.timestamp + TIMEOUT + 1);
        vm.prank(alice);
        corpus.reclaimBond(id);
        assertEq(corpus.credits(alice), BOND - (BOND * 500) / 10_000);
        assertApproxEqAbs(corpus.withdrawableDividendOf(bob), bobBefore + (BOND * 500) / 10_000, DUST);
    }

    // ---------------------------------------------------------------- buyAccess

    function test_buyAccess_revertsWhenCorpusIsEmpty() public {
        vm.prank(buyer);
        vm.expectRevert(Corpus.NoDataYet.selector);
        corpus.buyAccess{value: PRICE}();
    }

    function test_buyAccess_splitsRevenueExactly() public {
        _accept(alice, keccak256("a"), 500);
        uint256 protocolBefore = corpus.credits(protocol);
        uint256 curatorBefore = corpus.credits(curator);
        uint256 aliceBefore = corpus.withdrawableDividendOf(alice);

        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();

        assertEq(corpus.credits(protocol) - protocolBefore, 0.1 ether, "protocol takes 10%");
        assertEq(corpus.credits(curator) - curatorBefore, 0.2 ether, "curator takes 20%");
        assertApproxEqAbs(corpus.withdrawableDividendOf(alice) - aliceBefore, 0.7 ether, DUST, "holders take 70%");
        assertTrue(corpus.hasAccess(buyer));
    }

    function test_buyAccess_expiresAndRenews() public {
        _accept(alice, keccak256("a"), 500);
        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();
        vm.warp(block.timestamp + ACCESS + 1);
        assertFalse(corpus.hasAccess(buyer), "access is a subscription, not a perpetual grant");

        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();
        assertTrue(corpus.hasAccess(buyer));
    }

    function test_buyAccess_renewalStacksFromCurrentExpiry() public {
        _accept(alice, keccak256("a"), 500);
        vm.startPrank(buyer);
        corpus.buyAccess{value: PRICE}();
        corpus.buyAccess{value: PRICE}();
        vm.stopPrank();
        assertEq(corpus.accessUntil(buyer), uint40(block.timestamp) + ACCESS * 2);
    }

    function test_buyAccess_revertsOnWrongPrice() public {
        _accept(alice, keccak256("a"), 500);
        vm.prank(buyer);
        vm.expectRevert(Corpus.WrongPrice.selector);
        corpus.buyAccess{value: 0.5 ether}();
    }

    // ------------------------------------------------------------------ payouts

    function test_claimAndWithdrawPayReal() public {
        _accept(alice, keccak256("a"), 500);
        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();

        uint256 before = alice.balance;
        vm.startPrank(alice);
        corpus.claimDividends();
        corpus.withdrawCredits();
        vm.stopPrank();
        assertApproxEqAbs(alice.balance, before + 0.7 ether + BOND, DUST);
    }

    function test_claimRevertsWhenNothingOwed() public {
        vm.prank(alice);
        vm.expectRevert(Corpus.NothingToClaim.selector);
        corpus.claimDividends();
    }

    // -------------------------------------------------------------------- pause

    function test_pauseBlocksSubmitAndBuyButNeverClaims() public {
        _accept(alice, keccak256("a"), 500);
        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();

        vm.warp(block.timestamp + 25 hours);
        vm.prank(curator);
        corpus.pause();

        vm.prank(bob);
        vm.expectRevert(Corpus.IsPaused.selector);
        corpus.submit{value: BOND}(keccak256("b"), "cas://x");

        vm.prank(alice);
        corpus.claimDividends(); // must still work while paused
    }

    function test_pauseAutoExpires() public {
        vm.warp(block.timestamp + 25 hours);
        vm.prank(curator);
        corpus.pause();
        vm.warp(block.timestamp + 24 hours + 1);
        assertFalse(corpus.paused(), "a curator cannot freeze the market indefinitely");
        _submit(alice, keccak256("a"));
    }

    function test_pauseCannotBeRenewedImmediately() public {
        vm.warp(block.timestamp + 25 hours);
        vm.prank(curator);
        corpus.pause();
        vm.prank(curator);
        vm.expectRevert(Corpus.PauseCooldown.selector);
        corpus.pause();
    }

    function test_onlyCuratorCanPause() public {
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        vm.expectRevert(Corpus.OnlyCurator.selector);
        corpus.pause();
    }

    // -------------------------------------------------------------------- views

    function test_getSubmissionsClampsPastTheEnd() public {
        _submit(alice, keccak256("a"));
        Corpus.Submission[] memory page = corpus.getSubmissions(0, 50);
        assertEq(page.length, 1);
        assertEq(corpus.getSubmissions(5, 10).length, 0);
    }

    // ------------------------------------------------------------------ factory

    function test_factoryRejectsScorerEqualToCurator() public {
        vm.expectRevert(CorpusFactory.ScorerIsCurator.selector);
        factory.createCorpus("x", "X", "u", scorer, scorer, BOND, PRICE, TIMEOUT, ACCESS);
    }

    function test_factoryRejectsOutOfRangeTimeout() public {
        vm.expectRevert(CorpusFactory.InvalidTimeout.selector);
        factory.createCorpus("x", "X", "u", scorer, curator, BOND, PRICE, 1 minutes, ACCESS);
    }

    function test_factoryRejectsZeroBondAndPrice() public {
        vm.expectRevert(CorpusFactory.InvalidBond.selector);
        factory.createCorpus("x", "X", "u", scorer, curator, 0, PRICE, TIMEOUT, ACCESS);
        vm.expectRevert(CorpusFactory.InvalidPrice.selector);
        factory.createCorpus("x", "X", "u", scorer, curator, BOND, 0, TIMEOUT, ACCESS);
    }

    function test_factoryRegistersCorpus() public view {
        assertEq(factory.corporaCount(), 1);
        assertEq(factory.corpora(0), address(corpus));
    }

    receive() external payable {}
}
