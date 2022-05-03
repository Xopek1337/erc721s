// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/Strings.sol";

/// @title Mock Locker Contract
/// @author Fil Makarov (@filmakarov)

interface IMockNFT { 
    function permitLock(address signer, address locker, uint256 tokenId, uint256 deadline, bytes memory sig, address unlocker) external;
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) external;
    function unlock(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external returns (address);
}

contract MockLockerContract {  

using Strings for uint256;

    /*///////////////////////////////////////////////////////////////
                            GENERAL STORAGE
    //////////////////////////////////////////////////////////////*/

    IMockNFT private mockNFT;
    mapping(uint256 => address) prevHolders;

    /*///////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address mockNFTContr) {

        mockNFT = IMockNFT(mockNFTContr);
    }

    /*///////////////////////////////////////////////////////////////
                        LOGIC
    //////////////////////////////////////////////////////////////*/

    function lockAndTransfer(
        address signer,
        address locker,
        uint256 tokenId,
        uint256 deadline,
        bytes memory sig,
        address to
        ) public {
            
            // use the permit
            mockNFT.permitLock(
                signer,
                locker,
                tokenId,
                deadline,
                sig,
                address(this)
            );
            //transferFrom
            mockNFT.safeTransferFrom(signer, to, tokenId, "");
            //keep prev holder
            prevHolders[tokenId] = signer;
    }

    function unlockAndTransferBack(uint256 tokenId) public {
        mockNFT.unlock(tokenId);
        mockNFT.safeTransferFrom(mockNFT.ownerOf(tokenId), prevHolders[tokenId], tokenId, "");
    }

}

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20G is ERC20 {
    constructor(address[] memory accounts) ERC20("GTK", "Gold") {
        for(uint i = 0; i<accounts.length; i++){
            _mint(accounts[i], 10000000);
        }
    }

    function supportsInterface(bytes4 interfaceId) public pure virtual returns (bool) {
        return interfaceId == 0x01ffc9a7; // ERC165 Interface ID for ERC165
    }
}

