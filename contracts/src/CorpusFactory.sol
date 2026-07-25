// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Corpus} from "./Corpus.sol";

/**
 * @title CorpusFactory
 * @notice Deploys datasets. The parameter checks here are what stop the most
 *         obvious way to abuse a curated market: a curator who is also the scorer
 *         could reject every submission and keep the bonds, so the two roles are
 *         required to be different addresses.
 */
contract CorpusFactory {
    address public immutable protocolTreasury;
    address[] public corpora;

    event CorpusCreated(
        address indexed corpus, address indexed curator, address indexed scorer, string name, string symbol
    );

    error ScorerIsCurator();
    error ZeroAddress();
    error InvalidBond();
    error InvalidPrice();
    error InvalidTimeout();
    error InvalidAccessDuration();

    constructor() {
        protocolTreasury = msg.sender;
    }

    function createCorpus(
        string calldata name,
        string calldata symbol,
        string calldata schemaURI,
        address scorer,
        address curator,
        uint96 bondAmount,
        uint96 accessPrice,
        uint40 scoreTimeout,
        uint40 accessDuration
    ) external returns (address corpus) {
        if (scorer == address(0) || curator == address(0)) revert ZeroAddress();
        if (scorer == curator) revert ScorerIsCurator();
        if (bondAmount == 0) revert InvalidBond();
        if (accessPrice == 0) revert InvalidPrice();
        if (scoreTimeout < 5 minutes || scoreTimeout > 7 days) revert InvalidTimeout();
        if (accessDuration < 1 days || accessDuration > 365 days) revert InvalidAccessDuration();

        corpus = address(
            new Corpus(
                name, symbol, schemaURI, scorer, curator, protocolTreasury,
                bondAmount, accessPrice, scoreTimeout, accessDuration
            )
        );
        corpora.push(corpus);
        emit CorpusCreated(corpus, curator, scorer, name, symbol);
    }

    function corporaCount() external view returns (uint256) {
        return corpora.length;
    }
}
