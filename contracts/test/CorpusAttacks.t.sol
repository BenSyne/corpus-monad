// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Corpus} from "../src/Corpus.sol";
import {CorpusFactory} from "../src/CorpusFactory.sol";

/// Tries to re-enter the payout functions while being paid.
contract Reenterer {
    Corpus public corpus;
    bool public tried;
    bool public succeeded;

    constructor(Corpus _corpus) {
        corpus = _corpus;
    }

    function submit(bytes32 hash) external payable {
        corpus.submit{value: msg.value}(hash, "cas://x");
    }

    function claim() external {
        corpus.claimDividends();
    }

    function withdraw() external {
        corpus.withdrawCredits();
    }

    enum Target { Dividends, Credits }

    Target public target;
    uint256 public received;

    function setTarget(Target t) external {
        target = t;
    }

    receive() external payable {
        received += msg.value;
        if (tried) return;
        tried = true;
        if (target == Target.Dividends) {
            try corpus.claimDividends() {
                succeeded = true;
            } catch {}
        } else {
            try corpus.withdrawCredits() {
                succeeded = true;
            } catch {}
        }
    }
}

contract CorpusAttacksTest is Test {
    CorpusFactory factory;
    Corpus corpus;

    address scorer;
    address curator;
    address alice;
    address mallory;
    address buyer;

    uint96 constant BOND = 0.1 ether;
    uint96 constant PRICE = 1 ether;

    function setUp() public {
        scorer = makeAddr("scorer");
        curator = makeAddr("curator");
        alice = makeAddr("alice");
        mallory = makeAddr("mallory");
        buyer = makeAddr("buyer");
        factory = new CorpusFactory();
        corpus = Corpus(
            factory.createCorpus("Evals", "EVAL", "u", scorer, curator, BOND, PRICE, 15 minutes, 30 days)
        );
        vm.deal(alice, 10 ether);
        vm.deal(mallory, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    function _accept(address who, bytes32 hash, uint16 score) internal returns (uint256 id) {
        vm.prank(who);
        id = corpus.submit{value: BOND}(hash, "cas://x");
        vm.prank(scorer);
        corpus.postScore(id, score, "novel");
    }

    // ----------------------------------------------------------- access control

    function test_onlyScorerCanPostScore() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.prank(mallory);
        vm.expectRevert(Corpus.OnlyScorer.selector);
        corpus.postScore(id, 1000, "mine now");
    }

    function test_cannotScoreTwice() public {
        uint256 id = _accept(alice, keccak256("a"), 500);
        vm.prank(scorer);
        vm.expectRevert(Corpus.NotPending.selector);
        corpus.postScore(id, 1000, "again");
    }

    function test_cannotScoreAfterReclaim() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(alice);
        corpus.reclaimBond(id);

        vm.prank(scorer);
        vm.expectRevert(Corpus.NotPending.selector);
        corpus.postScore(id, 900, "too late");
    }

    function test_cannotReclaimAfterScoring() public {
        uint256 id = _accept(alice, keccak256("a"), 500);
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(alice);
        vm.expectRevert(Corpus.NotPending.selector);
        corpus.reclaimBond(id);
    }

    function test_onlyContributorCanReclaim() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(mallory);
        vm.expectRevert(Corpus.OnlyContributor.selector);
        corpus.reclaimBond(id);
    }

    // -------------------------------------------------------- content ownership

    function test_strangerCannotClaimAFreedHash() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.prank(scorer);
        corpus.postScore(id, 0, "rejected"); // frees the hash

        // The hash is public in the event log, and the stored blob is readable, so
        // without an owner check anyone could resubmit someone else's work.
        vm.prank(mallory);
        vm.expectRevert(Corpus.NotContentOwner.selector);
        corpus.submit{value: BOND}(keccak256("a"), "cas://x");
    }

    function test_strangerCannotClaimAnExpiredHash() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(alice);
        corpus.reclaimBond(id);

        vm.prank(mallory);
        vm.expectRevert(Corpus.NotContentOwner.selector);
        corpus.submit{value: BOND}(keccak256("a"), "cas://x");
    }

    // ------------------------------------------------------------- reentrancy

    function test_reentrancyOnClaimDividendsGainsNothing() public {
        Reenterer attacker = new Reenterer(corpus);
        vm.deal(address(attacker), 1 ether);

        attacker.submit{value: BOND}(keccak256("a"));
        vm.prank(scorer);
        corpus.postScore(0, 500, "novel");
        _accept(alice, keccak256("b"), 500);

        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();

        attacker.setTarget(Reenterer.Target.Dividends);
        uint256 owed = corpus.withdrawableDividendOf(address(attacker));
        uint256 before = address(attacker).balance;
        attacker.claim();

        assertTrue(attacker.tried(), "the attacker did attempt to re-enter");
        assertFalse(attacker.succeeded(), "re-entry must find nothing left to claim");
        assertEq(address(attacker).balance - before, owed, "paid exactly once, never twice");
    }

    function test_reentrancyOnWithdrawCreditsGainsNothing() public {
        Reenterer attacker = new Reenterer(corpus);
        vm.deal(address(attacker), 1 ether);
        attacker.submit{value: BOND}(keccak256("a"));
        vm.prank(scorer);
        corpus.postScore(0, 500, "novel");

        attacker.setTarget(Reenterer.Target.Credits);
        uint256 owed = corpus.creditsOf(address(attacker));
        uint256 before = address(attacker).balance;
        attacker.withdraw();
        assertFalse(attacker.succeeded(), "re-entry must find the credit already zeroed");
        assertEq(address(attacker).balance - before, owed, "paid exactly once, never twice");
    }

    // --------------------------------------------------------- share transfers

    function test_selfTransferCannotInflateBalance() public {
        _accept(alice, keccak256("a"), 500);
        uint256 balance = corpus.balanceOf(alice);
        vm.prank(alice);
        corpus.transfer(alice, balance);
        assertEq(corpus.balanceOf(alice), balance, "self-transfer must be a no-op");
        assertEq(corpus.totalSupply(), balance);
    }

    function test_cannotTransferToZeroOrContract() public {
        _accept(alice, keccak256("a"), 500);
        vm.startPrank(alice);
        vm.expectRevert(Corpus.InvalidRecipient.selector);
        corpus.transfer(address(0), 1e15);
        vm.expectRevert(Corpus.InvalidRecipient.selector);
        corpus.transfer(address(corpus), 1e15);
        vm.stopPrank();
    }

    function test_cannotTransferMoreThanHeld() public {
        _accept(alice, keccak256("a"), 500);
        uint256 tooMuch = corpus.balanceOf(alice) + 1;
        vm.prank(alice);
        vm.expectRevert(Corpus.InsufficientBalance.selector);
        corpus.transfer(mallory, tooMuch);
    }

    // ------------------------------------------------- known limitation, proven

    function test_slashExclusionIsBypassableWithASecondWallet() public {
        // Documented limitation: exclusion is by address, so a contributor who keeps
        // shares in a separate wallet still collects part of their own slash. Proving
        // it here keeps the claim honest rather than aspirational.
        address malloryShares = makeAddr("malloryShares");
        _accept(alice, keccak256("a"), 500);
        vm.deal(malloryShares, 1 ether);
        vm.prank(malloryShares);
        uint256 id = corpus.submit{value: BOND}(keccak256("m"), "cas://x");
        vm.prank(scorer);
        corpus.postScore(id, 500, "novel"); // mallory's other wallet now holds shares

        uint256 before = corpus.withdrawableDividendOf(malloryShares);
        vm.prank(mallory);
        uint256 junk = corpus.submit{value: BOND}(keccak256("junk"), "cas://x");
        vm.prank(scorer);
        corpus.postScore(junk, 0, "slop");

        assertGt(
            corpus.withdrawableDividendOf(malloryShares),
            before,
            "a second wallet recovers part of the slash - identity is the unsolved half"
        );
    }
}
