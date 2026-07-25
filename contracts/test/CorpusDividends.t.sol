// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Corpus} from "../src/Corpus.sol";
import {CorpusFactory} from "../src/CorpusFactory.sol";

contract CorpusDividendsTest is Test {
    CorpusFactory factory;
    Corpus corpus;

    address scorer;
    address curator;
    address alice;
    address bob;
    address buyer;

    uint96 constant BOND = 0.1 ether;
    uint96 constant PRICE = 1 ether;
    uint256 constant DUST = 10;

    function setUp() public {
        scorer = makeAddr("scorer");
        curator = makeAddr("curator");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        buyer = makeAddr("buyer");
        factory = new CorpusFactory();
        corpus = Corpus(factory.createCorpus("E", "E", "u", scorer, curator, BOND, PRICE, 15 minutes, 30 days));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(buyer, 100 ether);
    }

    function _accept(address who, bytes32 hash, uint16 score) internal returns (uint256 id) {
        vm.prank(who);
        id = corpus.submit{value: BOND}(hash, "cas://x");
        vm.prank(scorer);
        corpus.postScore(id, score, "novel");
    }

    // ------------------------------------------------- accumulator correctness

    function test_lateMinterEarnsNothingFromEarlierRevenue() public {
        _accept(alice, keccak256("a"), 500);
        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();

        _accept(bob, keccak256("b"), 500);
        assertEq(corpus.withdrawableDividendOf(bob), 0, "shares must not claim revenue that predates them");
        // Alice keeps the whole purchase and also collects the fee bob paid to mint.
        assertApproxEqAbs(corpus.withdrawableDividendOf(alice), 0.7 ether + (BOND * 2000) / 10_000, DUST);
    }

    function test_revenueAfterASecondMintSplitsByShare() public {
        _accept(alice, keccak256("a"), 500);
        _accept(bob, keccak256("b"), 500); // equal shares
        uint256 aliceBefore = corpus.withdrawableDividendOf(alice);
        uint256 bobBefore = corpus.withdrawableDividendOf(bob);

        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();

        assertApproxEqAbs(corpus.withdrawableDividendOf(alice) - aliceBefore, 0.35 ether, DUST);
        assertApproxEqAbs(corpus.withdrawableDividendOf(bob) - bobBefore, 0.35 ether, DUST);
    }

    function test_transferMovesFutureDividendsNotPastOnes() public {
        _accept(alice, keccak256("a"), 500);
        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();
        uint256 earned = corpus.withdrawableDividendOf(alice);

        uint256 shares = corpus.balanceOf(alice);
        vm.prank(alice);
        corpus.transfer(bob, shares);

        assertApproxEqAbs(corpus.withdrawableDividendOf(alice), earned, DUST, "past dividends stay with the sender");
        assertEq(corpus.withdrawableDividendOf(bob), 0, "the receiver's claim starts now");

        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();
        assertApproxEqAbs(corpus.withdrawableDividendOf(bob), 0.7 ether, DUST, "future revenue follows the shares");
        assertApproxEqAbs(corpus.withdrawableDividendOf(alice), earned, DUST);
    }

    function test_multiplePurchasesAccumulate() public {
        _accept(alice, keccak256("a"), 500);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(buyer);
            corpus.buyAccess{value: PRICE}();
        }
        assertApproxEqAbs(corpus.withdrawableDividendOf(alice), 2.1 ether, DUST);
    }

    // ------------------------------------------------- zero-supply fallbacks
    // Every distribution site must have a defined answer when there is nobody to
    // pay, or the first accept in a corpus divides by zero and the demo dies.

    function test_firstAcceptWaivesTheMintFee() public {
        _accept(alice, keccak256("a"), 500);
        assertEq(corpus.credits(alice), BOND, "no holders existed, so nobody was diluted");
        assertEq(corpus.withdrawableDividendOf(alice), 0);
    }

    function test_reclaimWithNoHoldersRefundsInFull() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(alice);
        corpus.reclaimBond(id);
        assertEq(corpus.credits(alice), BOND);
    }

    function test_rejectWithNoHoldersRefundsTheContributor() public {
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("a"), "cas://x");
        vm.prank(scorer);
        corpus.postScore(id, 0, "bad schema");
        assertEq(corpus.credits(alice), BOND, "there are no holders to pay, so the bond comes back");
    }

    function test_rejectWhenTheRejecteeHoldsEverySharePaysThemBack() public {
        _accept(alice, keccak256("a"), 500); // alice holds 100% of supply
        vm.prank(alice);
        uint256 id = corpus.submit{value: BOND}(keccak256("junk"), "cas://x");
        vm.prank(scorer);
        corpus.postScore(id, 0, "slop");
        // Excluding the sole holder leaves an effective supply of zero: refund rather
        // than divide by it. The slash is toothless here, which is honest — there is
        // nobody else in the corpus to compensate.
        assertEq(corpus.credits(alice), BOND * 2);
    }

    // ------------------------------------------------------------- invariants

    function test_balanceCoversEveryObligation() public {
        _accept(alice, keccak256("a"), 700);
        _accept(bob, keccak256("b"), 300);
        vm.prank(buyer);
        corpus.buyAccess{value: PRICE}();
        vm.prank(alice);
        uint256 junk = corpus.submit{value: BOND}(keccak256("j"), "cas://x");
        vm.prank(scorer);
        corpus.postScore(junk, 0, "dupe");

        _assertSolvent();
    }

    /// Fuzzes the *sequence* of calls rather than the amounts: bond and price are
    /// fixed at construction, so fuzzing values would only find unreachable states.
    function testFuzz_sequenceKeepsContractSolvent(uint8[16] calldata actions) public {
        uint256 nonce;
        for (uint256 i = 0; i < actions.length; i++) {
            uint256 action = actions[i] % 5;
            address actor = i % 2 == 0 ? alice : bob;

            if (action == 0) {
                vm.prank(actor);
                try corpus.submit{value: BOND}(keccak256(abi.encode(nonce++)), "cas://x") {} catch {}
            } else if (action == 1) {
                uint256 count = corpus.submissionCount();
                if (count > 0) {
                    uint256 id = uint256(actions[i]) % count;
                    vm.prank(scorer);
                    try corpus.postScore(id, uint16(uint256(actions[i]) % 1001), "fuzz") {} catch {}
                }
            } else if (action == 2) {
                vm.prank(buyer);
                try corpus.buyAccess{value: PRICE}() {} catch {}
            } else if (action == 3) {
                vm.prank(actor);
                try corpus.claimDividends() {} catch {}
            } else {
                vm.prank(actor);
                try corpus.withdrawCredits() {} catch {}
            }
            _assertSolvent();
        }
    }

    function _assertSolvent() internal view {
        uint256 obligations = corpus.credits(alice) + corpus.credits(bob) + corpus.credits(curator)
            + corpus.credits(address(this)) + corpus.withdrawableDividendOf(alice) + corpus.withdrawableDividendOf(bob)
            + corpus.withdrawableDividendOf(curator);

        uint256 pendingBonds;
        uint256 count = corpus.submissionCount();
        for (uint256 i = 0; i < count; i++) {
            Corpus.Submission memory s = corpus.getSubmission(i);
            if (s.status == Corpus.Status.Pending) pendingBonds += s.bond;
        }

        assertGe(
            address(corpus).balance,
            obligations + pendingBonds,
            "the contract must always hold enough to pay everything it owes"
        );
    }

    receive() external payable {}
}
