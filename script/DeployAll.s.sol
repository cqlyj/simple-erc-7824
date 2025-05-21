// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "src/MockUSDC.sol";
import {Adjudicator} from "src/nitrolite/Adjudicator.sol";
import {Custody} from "src/nitrolite/Custody.sol";

contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at: ", address(usdc));

        Adjudicator adjudicator = new Adjudicator();
        console.log("Adjudicator deployed at: ", address(adjudicator));

        Custody custody = new Custody();
        console.log("Custody deployed at: ", address(custody));

        vm.stopBroadcast();
    }
}
