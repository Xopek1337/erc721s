// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./LockNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract NFTMarketplaceV2 is Ownable {
    bytes4 private constant FUNC_SELECTOR = bytes4(keccak256("getLocked(uint256)"));
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    bytes32 public constant RENT_TYPEHASH =
        keccak256("Rent(address _token,address _payToken,uint256 tokenId,uint256 rentTime,uint256 price,uint256 nonce,uint256 deadline)");

    uint256 internal immutable INITIAL_CHAIN_ID;

    bytes32 internal immutable INITIAL_DOMAIN_SEPARATOR;

    bool public feePause = false;
    address public wallet;
    uint256 public fee;
    uint256 public day = 1 days;

    /// @dev multiplier for comission logic
    uint256 public feeMutltipier = 100;
    
    struct OfferData {
        uint256 price;
        uint256 endTime;
        address payToken;
    }

    struct RequestRefund {
        bool isLandlordAgree;
        bool isRenterAgree;
        uint256 payoutAmount;
    }

    struct RequestExtend {
        bool isRenterAgree;
        bool isLandlordAgree;
        uint256 payoutAmount;
        uint256 extendedTime;
    }

    struct RentData {
        address _token; 
        address _payToken; 
        uint256 tokenId;
        uint256 rentTime;
        uint256 price;
    }

    mapping(address => mapping(uint256 => mapping(address => RequestRefund))) public refundRequests;

    mapping(address => mapping(uint256 => mapping(address => RequestExtend))) public extendRequests;
    
    mapping(address => mapping(uint256 => mapping(address => OfferData))) public userOffers;

    mapping(address => uint256) public nonces;

    event RentCreated(
        address renter,
        address nft, 
        address landlord, 
        address _payToken, 
        uint256 tokenId, 
        uint256 rentTime,
        uint256 price
    );

    event BackedToken(
        address _token, 
        address landlord, 
        uint256 _tokenId
    );

    event RequestedExtendRent(
        address _token, 
        address landlord, 
        uint256 _tokenId, 
        uint256 _payoutAmount, 
        uint256 _extendedTime
    );

    event AcceptedExtendRent(
        address _token, 
        address landlord, 
        uint256 _tokenId, 
        uint256 _payoutAmount
    );

    event UpdateWallet(address indexed _wallet);

    event UpdateFee(uint256 _fee);
    
    event UpdateFeePause(bool _pause);

    constructor(address _wallet, uint256 _fee) {
        require(_wallet != address(0), "ZERO_ADDRESS");

        wallet = _wallet;
        fee = _fee;
        INITIAL_CHAIN_ID = block.chainid;
        INITIAL_DOMAIN_SEPARATOR = computeDomainSeparator();  
    }

    /**
     @notice Rent offered item
     @param rentData Data for offer to sign
     @return bool True if the function completed correctly
     */
    
    function rent(
        RentData memory rentData,
        uint256 deadline,
        bytes calldata sig,
        bytes calldata sigPermit
    ) 
        public
        returns(bool)
    {
        address ownerOfToken = LockNFT(rentData._token).ownerOf(rentData.tokenId);
        
        require(block.timestamp <= deadline, "DEADLINE_EXPIRED");
        
        // Unchecked because the only math done is incrementing
        // the nonce which cannot realistically overflow.
        unchecked {
            bytes32 digest = keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(RENT_TYPEHASH, rentData._token, rentData._payToken,
                    rentData.tokenId, rentData.rentTime, rentData.price, nonces[ownerOfToken]++, deadline))
                )
            );

            require(SignatureChecker.isValidSignatureNow(ownerOfToken, digest, sig), "INVALID_SIGNATURE");
        }
        
        permitAll(rentData._token, ownerOfToken, address(this), deadline, sigPermit);

        uint256 fullPrice;
        uint256 feeAmount;

        fullPrice = rentData.rentTime * rentData.price;
        
        feeAmount = fullPrice * fee / feeMutltipier;

        IERC20(rentData._payToken).transferFrom(
            msg.sender,
            wallet,
            feeAmount
        );

        IERC20(rentData._payToken).transferFrom(
            msg.sender,
            ownerOfToken,
            fullPrice - feeAmount
        );

        LockNFT(rentData._token).transferFrom(ownerOfToken, msg.sender, rentData.tokenId);
        LockNFT(rentData._token).lock(address(this), rentData.tokenId);

        userOffers[rentData._token][rentData.tokenId][ownerOfToken].endTime = rentData.rentTime * day + block.timestamp;
        userOffers[rentData._token][rentData.tokenId][ownerOfToken].price = fullPrice;
        userOffers[rentData._token][rentData.tokenId][ownerOfToken].payToken = rentData._payToken;

        emit RentCreated(
            msg.sender,
            rentData._token, 
            ownerOfToken, 
            rentData._payToken, 
            rentData.tokenId, 
            rentData.rentTime,
            fullPrice
        );

        return true;
    }

    function permitAll(
        address _token,
        address signer,
        address operator,
        uint256 deadline,
        bytes memory sigPermit
    ) public { //TODO: visibility must be internal on my opinion
        LockNFT(_token).permitAll(signer, operator, deadline, sigPermit);
    }

    /**
     @notice Back token if rent time is exceed
     @dev Only landlord or admin can call this function
     @param _token NFT contract address
     @param landlord Owner of offered token
     @param _tokenId TokenId
     @return bool True if the function completed correctly
     */

    function backToken(address _token, address landlord, uint _tokenId)
        public
        returns(bool)
    {
        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(msg.sender == landlord || msg.sender == owner(), "only landlord or admin can call back token");
        require(userOffers[_token][_tokenId][landlord].endTime <= block.timestamp, "rent time is not expired");

        LockNFT(_token).transferFrom(LockNFT(_token).ownerOf(_tokenId), landlord, _tokenId);

        delete (userOffers[_token][_tokenId][landlord]);

        emit BackedToken(_token, landlord, _tokenId);

        return true;
    }

    /**
     @notice Request for extend token rent
     @dev only renter can call this function
     @param _token NFT contract address
     @param landlord Owner of offered token
     @param _tokenId TokenId
     @param _payoutAmount Pay amount for extend rent
     @param _extendedTime Extended rent time
     @return bool True if the function completed correctly
     */

    function requestExtendRent(
        address _token, 
        address landlord, 
        uint _tokenId, 
        uint _payoutAmount, 
        uint _extendedTime
    ) 
        public
        returns(bool)
    {
        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(LockNFT(_token).ownerOf(_tokenId) == msg.sender, "caller should be a renter");

        RequestExtend storage request = extendRequests[_token][_tokenId][landlord];

        request.isRenterAgree = true;
        request.payoutAmount = _payoutAmount;
        request.extendedTime = _extendedTime;

        emit RequestedExtendRent(_token, landlord, _tokenId, _payoutAmount, _extendedTime);

        return true;
    }

    /**
     @notice Accept extend token rent
     @dev only landlord can call this function
     @param _token NFT contract address
     @param landlord Owner of offered token
     @param _tokenId TokenId
     @param _payoutAmount Pay amount for extend rent
     @return bool True if the function completed correctly
     */

    function acceptExtendRent(address _token, address landlord, uint _tokenId, uint _payoutAmount) 
        public
        returns(bool)
    {
        RequestExtend memory request = extendRequests[_token][_tokenId][landlord];

        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(landlord == msg.sender, "caller should be a landlord");
        require(_payoutAmount == request.payoutAmount, "invalid payout amount");

        address _payToken = userOffers[_token][_tokenId][landlord].payToken;
        uint _extendedTime = request.extendedTime;
        address renter = LockNFT(_token).ownerOf(_tokenId);
        
        if(request.isRenterAgree == true) {
            IERC20(_payToken).transferFrom(
                renter,
                landlord,
                _payoutAmount
            );
            userOffers[_token][_tokenId][landlord].endTime += _extendedTime * day;
        } else {
            revert("renter does not agree to the extend rent");
        }

        delete (extendRequests[_token][_tokenId][landlord]);

        emit AcceptedExtendRent(_token, landlord, _tokenId, _payoutAmount);

        return true;
    }

    /**
     @notice Checks if the conract matches ERC721s format 
     @param _contract Contract address
     @return bool True if the contract matches ERC721s format
     */

    function isLockingContract(address _contract) 
        public
        returns(bool)
    {
        bool success;
        bool isSupportedERC721 = IERC165(_contract).supportsInterface(INTERFACE_ID_ERC721);

        bytes memory data = abi.encodeWithSelector(FUNC_SELECTOR, 0);
        assembly {
            success := call(
                gas(),
                _contract,
                0,
                add(data, 32),
                mload(data),   
                0,             
                0         
            )
        }

        return success && isSupportedERC721;
    }

    /**
     @notice Checks if the token not locked
     @param _token Contract address
     @param tokenId TokenId
     @return bool True if the token is not locked
     */

    function checkLock(address _token, uint256 tokenId) 
        public
        returns(bool)
    {
        require(isLockingContract(_token), "contract does not support locking");
        address locker = ERC721s(_token).getLocked(tokenId);

        return locker == address(0) ? true : false;
    }

    /**
     @notice Set wallet for comission
     @dev Only admin
     @param _wallet Wallet address
     @return bool True if the function completed correctly
     */

    function setWallet(address _wallet)
        external
        onlyOwner
        returns (bool) 
    {
        wallet = _wallet;

        emit UpdateWallet(_wallet);

        return true;
    }

    /**
     @notice Set comission for rent
     @dev Only admin
     @param _fee Size of comission in percent
     @return bool True if the function completed correctly
     */

    function setFee(uint256 _fee)
        external
        onlyOwner
        returns (bool) 
    {
        fee = _fee;

        emit UpdateFee(_fee);

        return true;
    }

    /**
     @notice Stop payment of rental comission for pass holders
     @dev Only admin
     @param _pause Pause
     @return bool True if the function completed correctly
     */

    function setFeePause(bool _pause)
        external
        onlyOwner
        returns (bool) 
    {
        feePause = _pause;

        emit UpdateFeePause(_pause);

        return true;
    }
    
    function DOMAIN_SEPARATOR() public view virtual returns (bytes32 domainSeparator) {
        domainSeparator = block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : computeDomainSeparator();
    }

    function computeDomainSeparator() internal view virtual returns (bytes32 domainSeparator) {
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("NFTMarketplaceV2")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }
}