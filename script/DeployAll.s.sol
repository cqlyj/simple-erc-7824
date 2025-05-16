// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "src/MockUSDC.sol";
import {NitroAdjudicator} from "src/nitro/NitroAdjudicator.sol";
import {MicroPaymentApp} from "src/nitro/MicroPaymentApp.sol";
import {MultiAssetHolder} from "src/nitro/MultiAssetHolder.sol";

contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at: ", address(usdc));

        NitroAdjudicator adjudicator = new NitroAdjudicator();
        console.log("NitroAdjudicator deployed at: ", address(adjudicator));

        MicroPaymentApp app = new MicroPaymentApp();
        console.log("MicroPaymentApp deployed at: ", address(app));

        MultiAssetHolder multiAssetHolder = new MultiAssetHolder();
        console.log(
            "MultiAssetHolder deployed at: ",
            address(multiAssetHolder)
        );

        vm.stopBroadcast();
    }
}
