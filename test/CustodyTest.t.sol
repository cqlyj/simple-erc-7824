// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Custody, Channel, State, StateIntent, Allocation, Signature} from "src/nitrolite/Custody.sol";
import {MockUSDC} from "src/MockUSDC.sol";
import {Adjudicator} from "src/nitrolite/Adjudicator.sol";
import {Utils} from "@nitrolite/contract/src/Utils.sol";

contract CustodyTest is Test {
    Custody custody;
    MockUSDC usdc;
    Adjudicator adjudicator;

    uint256 userPk = 1;
    uint256 stateWalletPk = 2;
    uint256 systemPk = 3;

    address user;
    // state wallet is only used for signing stuffs
    address stateWallet;
    address system;

    uint256 constant DEPOSIT_AMOUNT = 1_000_000;

    function setUp() external {
        custody = new Custody();
        adjudicator = new Adjudicator();

        user = vm.addr(userPk);
        stateWallet = vm.addr(stateWalletPk);
        system = vm.addr(systemPk);
        vm.deal(user, 1 ether);
        vm.deal(system, 1 ether);

        // mint user has some usdc
        vm.prank(user);
        usdc = new MockUSDC();
    }

    function testChannelCreationWorks() external {
        vm.startPrank(user);
        usdc.approve(address(custody), DEPOSIT_AMOUNT);
        custody.deposit(address(usdc), DEPOSIT_AMOUNT);
        vm.stopPrank();

        (
            Channel memory chan,
            State memory initial
        ) = _generateChannelParameters();

        bytes32 stateHash = Utils.getStateHash(chan, initial);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(stateWalletPk, stateHash);
        Signature[] memory sigs = new Signature[](1);
        sigs[0] = Signature({v: v, r: r, s: s});
        initial.sigs = sigs;

        vm.startPrank(user);
        custody.create(chan, initial);
        vm.stopPrank();
    }

    function _generateChannelParameters()
        internal
        returns (Channel memory, State memory)
    {
        address[] memory participants = new address[](2);
        participants[0] = stateWallet;
        participants[1] = system;
        uint64 challenge = 86400;
        uint64 nonce = 1;

        Channel memory ch = Channel({
            participants: participants,
            adjudicator: address(adjudicator),
            challenge: challenge,
            nonce: nonce
        });

        StateIntent intent = StateIntent.INITIALIZE;
        uint256 version = 0;
        bytes memory data = "0x";
        Allocation[] memory allocations = new Allocation[](2);
        allocations[0] = Allocation({
            destination: stateWallet,
            token: address(usdc),
            amount: DEPOSIT_AMOUNT
        });
        allocations[1] = Allocation({
            destination: system,
            token: address(0),
            amount: 0
        });
        Signature[] memory sigs = new Signature[](1);

        State memory initial = State({
            intent: intent,
            version: version,
            data: data,
            allocations: allocations,
            sigs: sigs
        });

        return (ch, initial);
    }
}
