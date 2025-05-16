// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IForceMoveApp} from "@nitro/src/interfaces/IForceMoveApp.sol";
import {NitroUtils} from "@nitro/src/libraries/NitroUtils.sol";

// This contract will be used to handle micro payments states and utilizing the ERC-7824 state channels
// But the interesting stuff here is that for the two participants, only one signature is needed to make agreements
// The other participant only needs to provide a PIN, and once the other participant has the PIN
// It indicates that the other participant has agreed to the transaction

// @ADVANCE: This can also be extended to allow for multiple participants like buyer, seller, and our system
// But new architecture will be needed to handle the multiple participants, for now we will just focus on two participants
contract MicroPayment is IForceMoveApp {
    /*//////////////////////////////////////////////////////////////
                           STRUCTS AND ENUMS
    //////////////////////////////////////////////////////////////*/

    // Not used yet, but can be used if further checks are needed

    // struct MicroPaymentAppData {
    //     uint256 totalAmount;
    // }

    enum AllocationIndices {
        SYSTEM,
        USER
    }

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error OnlyOneProofNeeded();
    error NotSignedBySystem();
    error ParticipantsNumNotEqualTwo();

    /*//////////////////////////////////////////////////////////////
                           REQUIRED FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Encodes application-specific rules for a particular ForceMove-compliant state channel.
     * @dev Encodes application-specific rules for a particular ForceMove-compliant state channel.
     * @param fixedPart Fixed part of the state channel.
     * @param proof Array of recovered variable parts which constitutes a support proof for the candidate.
     * @param candidate Recovered variable part the proof was supplied for.
     */
    function stateIsSupported(
        FixedPart calldata fixedPart,
        RecoveredVariablePart[] calldata proof,
        RecoveredVariablePart calldata candidate
    ) external pure returns (bool, string memory) {
        // Since only if the other participant has the PIN, it indicates that the other participant has agreed to the transaction
        // We could say that this signature is signed by both participants
        // And thus we only need one proof of the newest state
        // We don't need to check all proofs of the state changes, only the newest proof
        // The proof can only be created if both participants have agreed to the transaction
        // You can think of it as a multi-signature transaction, we only check the final signature
        if (proof.length != 1) {
            revert OnlyOneProofNeeded();
        }

        // We only to check if the proof is signed by system
        // As we said before, it seems to be only one party is engaged in the process, however system does not hold the pk to sign
        // Only both the user and system agreed then the system can have the signature
        // here we just check if the proof is signed by the system(with the PIN provided by the user)
        if (
            !NitroUtils.isClaimedSignedBy(
                candidate.signedBy,
                uint8(AllocationIndices.SYSTEM)
            )
        ) {
            revert NotSignedBySystem();
        }

        // Check whether the participants are exactly two
        if (fixedPart.participants.length != 2) {
            revert ParticipantsNumNotEqualTwo();
        }

        return (true, "");
    }
}
