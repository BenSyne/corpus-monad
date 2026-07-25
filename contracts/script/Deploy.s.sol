// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CorpusFactory} from "../src/CorpusFactory.sol";
import {Corpus} from "../src/Corpus.sol";

/// Deploys the factory and one demo corpus, printing both addresses for the
/// address-export step. The corpus address is also readable from `corpora(0)`,
/// which is how the exporter finds it — factory-created contracts are not named
/// in the broadcast artifact.
contract Deploy is Script {
    function run() external {
        address scorer = vm.envAddress("SCORER_ADDRESS");
        address curator = vm.envAddress("CURATOR_ADDRESS");

        vm.startBroadcast();
        CorpusFactory factory = new CorpusFactory();
        address corpus = factory.createCorpus(
            "Model Red-Team Evals",
            "REDTEAM",
            "file://data/seed/corpus-config.json",
            scorer,
            curator,
            0.1 ether,
            1 ether,
            15 minutes,
            30 days
        );
        vm.stopBroadcast();

        console.log("FACTORY=%s", address(factory));
        console.log("CORPUS=%s", corpus);
    }
}
