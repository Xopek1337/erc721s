// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./LockNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract NFTMarketplace is Ownable {
    bytes4 private constant FUNC_SELECTOR = bytes4(keccak256("getLocked(uint256)"));
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    bool public feePause = false;
    address public wallet;
    uint256 public fee;
    uint256 public day = 1 days;

    /// @dev multiplier for comission logic to divide the comission on two parts
    uint256 public feeMutltipier = 200;
    
    struct OfferData {
        uint256 minTime;
        uint256 maxTime;
        uint256 startDiscountTime;
        uint256 price;
        uint256 discountPrice;
        uint256 endTime;
        address payToken;
        address passToken;
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

    mapping(address => mapping(uint256 => mapping(address => RequestRefund))) public refundRequests;

    mapping(address => mapping(uint256 => mapping(address => RequestExtend))) public extendRequests;
    
    mapping(address => mapping(uint256 => mapping(address => OfferData))) public userOffers;

    event OfferCreated(
        address creator,
        address nft,
        address payToken,
        address passToken,
        uint256 tokenId,
        uint256 minTime, 
        uint256 maxTime, 
        uint256 startDiscountTime, 
        uint256 price, 
        uint256 discountPrice
    );
    event DiscountCreated(
        address holder,
        address nft, 
        uint256 tokenId, 
        uint256 startDiscountTime, 
        uint256 discountPrice
    );
    event RentCreated(
        address renter,
        address nft, 
        address landlord, 
        address _payToken, 
        uint256 tokenId, 
        uint256 rentTime
    );
    event BackedToken(
        address _token, 
        address landlord, 
        uint256 _tokenId
    );
    event RequestedRefundToken(
        address _token, 
        address landlord, 
        uint256 _tokenId, 
        uint256 _payoutAmount, 
        bool isRenter
    );
    event AcceptedRefundToken(
        address _token, 
        address landlord, 
        uint256 _tokenId, 
        uint256 _payoutAmount, 
        bool isRenter
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
    }

    /**
     @notice Creates a new offer for a given item
     @param _token NFT contract address
     @param payToken Paying token
     @param passToken Pass token
     @param tokenId TokenId
     @param minTime Min time for rent
     @param maxTime Max time for rent
     @param startDiscountTime time in days from which discount starts
     @param price Price for rent
     @param discountPrice Discount price for rent
     @return bool True if the function completed correctly
     */

    function offer(
        address _token, 
        address payToken,
        address passToken,
        uint256 tokenId, 
        uint256 minTime, 
        uint256 maxTime, 
        uint256 startDiscountTime, 
        uint256 price, 
        uint256 discountPrice
    )
        public
        returns(bool)
    {   
        require(
                LockNFT(_token).isApprovedForAll(msg.sender, address(this)),
                "token not approved"
            );
        require(payToken != address(0), "ZERO_ADDRESS");
        require(checkLock(_token, tokenId), "token is locked");
        require(userOffers[_token][tokenId][msg.sender].payToken == address(0), "offer already created");

        userOffers[_token][tokenId][msg.sender] = (OfferData(
            {minTime: minTime, 
            maxTime: maxTime, 
            startDiscountTime: startDiscountTime, 
            price: (price + price * fee / feeMutltipier), 
            discountPrice: (discountPrice + discountPrice * fee / feeMutltipier), 
            endTime: 0, 
            payToken: payToken,
            passToken: passToken}
        ));

        emit OfferCreated(
            msg.sender,
            _token, 
            payToken,
            passToken,
            tokenId, 
            minTime, 
            maxTime, 
            startDiscountTime, 
            price, 
            discountPrice
        );

        return true;
    }

    /**
     @notice Creates a new offers for a few items
     @param _token NFT contract address
     @param payToken Paying token
     @param passToken Pass token
     @param tokenIds TokenIds
     @param minTimes Min time for rent
     @param maxTimes Max time for rent
     @param prices Prices for rent
     @return bool True if the function completed correctly
     */

    function offerAll(
        address _token,
        address payToken,
        address passToken,
        uint256[] calldata tokenIds, 
        uint256[] calldata minTimes, 
        uint256[] calldata maxTimes, 
        uint256[] calldata prices
    )
        public
        returns(bool)
    {   
        require(
                tokenIds.length == minTimes.length &&
                minTimes.length == maxTimes.length &&
                maxTimes.length == prices.length, "arrays must be the same length"
            );
        require(
                LockNFT(_token).isApprovedForAll(msg.sender, address(this)),
                "token not approved"
            );
        require(payToken != address(0), "ZERO_ADDRESS");

        for(uint i = 0; i < tokenIds.length; i++) {
            require(userOffers[_token][tokenIds[i]][msg.sender].payToken == address(0), "offer already created");
            require(checkLock(_token, tokenIds[i]), "token is locked");

            userOffers[_token][tokenIds[i]][msg.sender] = (OfferData(
                {minTime: minTimes[i], 
                maxTime: maxTimes[i], 
                startDiscountTime: 0, 
                price: (prices[i] + prices[i] * fee / feeMutltipier), 
                discountPrice: (prices[i] + prices[i] * fee / feeMutltipier), 
                endTime: 0, 
                payToken: payToken,
                passToken: passToken}
            ));

            emit OfferCreated(
                msg.sender,
                _token, 
                payToken,
                passToken,
                tokenIds[i], 
                minTimes[i], 
                maxTimes[i], 
                0, 
                prices[i], 
                0
            );
        }

        return true;
    }

    /**
     @notice Set discount price and time for offered items
     @param _token NFT contract address
     @param tokenIds TokenIds
     @param startDiscountTimes Times in days from which discounts starts
     @param discountPrices Discount prices for rent
     @return bool True if the function completed correctly
     */

    function setDiscountData(
        address _token, 
        uint256[] calldata tokenIds, 
        uint256[] calldata startDiscountTimes, 
        uint256[] calldata discountPrices
    )
        public 
        returns(bool)
    {   
        require(
                tokenIds.length == startDiscountTimes.length &&
                startDiscountTimes.length == discountPrices.length, "arrays must be the same length"
            );

        for(uint i = 0; i < tokenIds.length; i++) {
            require(userOffers[_token][tokenIds[i]][msg.sender].payToken != address(0), "offer is not exist");

            userOffers[_token][tokenIds[i]][msg.sender].discountPrice = discountPrices[i] + discountPrices[i] * fee / feeMutltipier;
            userOffers[_token][tokenIds[i]][msg.sender].startDiscountTime = startDiscountTimes[i];

            emit DiscountCreated(
                msg.sender,
                _token, 
                tokenIds[i], 
                startDiscountTimes[i], 
                discountPrices[i]
            );
        }
        
        return true;
    }

    /**
     @notice Rent offered item
     @param _token NFT contract address
     @param landlord Owner of offered token
     @param _payToken Paying token
     @param tokenId TokenId
     @param rentTime Rent time
     @return bool True if the function completed correctly
     */

    function rent(
        address _token, 
        address landlord, 
        address _payToken, 
        uint256 tokenId, 
        uint256 rentTime
    ) 
        public
        returns(bool)
    {
        OfferData memory myData = userOffers[_token][tokenId][landlord];
        require(
                LockNFT(_token).isApprovedForAll(msg.sender, address(this)),
                "token not approved"
            );
        require(myData.payToken != address(0), "offer is not exist");
        require(_payToken == myData.payToken, "token is not valid");
        require(rentTime >= myData.minTime && rentTime <=  myData.maxTime, "invalid rent time");

        uint price;
        uint feeAmount;

        if(rentTime > myData.startDiscountTime) {
            price = myData.startDiscountTime * myData.price + (rentTime - myData.startDiscountTime) * myData.discountPrice;
        } else {
            price = rentTime * myData.price;
        }
        
        feeAmount = price * fee / feeMutltipier;

        if(myData.passToken != address(0)) {
            require(IERC721(myData.passToken).balanceOf(msg.sender) > 0, "renter does not have pass token");
            feePause ? feeAmount = 0 : feeAmount;
        }

        IERC20(_payToken).transferFrom(
            msg.sender,
            wallet,
            feeAmount
        );

        IERC20(_payToken).transferFrom(
            msg.sender,
            landlord,
            price - feeAmount
        );

        LockNFT(_token).transferFrom(landlord, msg.sender, tokenId);
        LockNFT(_token).lock(address(this), tokenId);

        userOffers[_token][tokenId][landlord].endTime = rentTime * day + block.timestamp;

        emit RentCreated(
            msg.sender,
            _token, 
            landlord, 
            _payToken, 
            tokenId, 
            rentTime
        );

        return true;
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
     @notice Early token refund request
     @dev only renter or landlord can call this function
     @dev if the caller is renter, he must set True to isRenter
     @dev is the caller is landlord, he must set False to isRenter
     @param _token NFT contract address
     @param landlord Owner of offered token
     @param _tokenId TokenId
     @param _payoutAmount Compensation for early refund
     @param isRenter Checks if the caller is renter
     @return bool True if the function completed correctly
     */

    function requestRefundToken(address _token, address landlord, uint _tokenId, uint _payoutAmount, bool isRenter) 
        public
        returns(bool)
    {   
        address _payToken = userOffers[_token][_tokenId][landlord].payToken;
        require(_payToken != address(0), "offer is not exist");
        
        RequestRefund storage request = refundRequests[_token][_tokenId][landlord];

        if(isRenter) {
            require(LockNFT(_token).ownerOf(_tokenId) == msg.sender, "caller should be a renter");
            
            request.isRenterAgree = true;
            request.payoutAmount = _payoutAmount;
        } else {
            require(msg.sender == landlord, "caller should be a landlord");
            require(IERC20(_payToken).allowance(landlord, address(this)) >= _payoutAmount, "pay tokens is not approved");

            request.isLandlordAgree = true;
            request.payoutAmount = _payoutAmount;
        }

        emit RequestedRefundToken(_token, landlord, _tokenId, _payoutAmount, isRenter);

        return true;
    }

     /**
     @notice Accept early token refund
     @dev only renter or landlord can call this function
     @dev if the caller is renter, he must set True to isRenter
     @dev is the caller is landlord, he must set False to isRenter
     @param _token NFT contract address
     @param landlord Owner of offered token
     @param _tokenId TokenId
     @param _payoutAmount Compensation for early refund
     @param isRenter Checks if the caller is renter
     @return bool True if the function completed correctly
     */

    function acceptRefundToken(
        address _token, 
        address landlord, 
        uint _tokenId, 
        uint _payoutAmount, 
        bool isRenter
    ) 
        public
        returns(bool)
    {
        RequestRefund memory request = refundRequests[_token][_tokenId][landlord];

        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(_payoutAmount == request.payoutAmount, "invalid payout amount");

        address _payToken = userOffers[_token][_tokenId][landlord].payToken;
        address renter = LockNFT(_token).ownerOf(_tokenId);

        if(isRenter) {
            if(request.isLandlordAgree == true) {
                require(renter == msg.sender, "caller should be a renter");

                IERC20(_payToken).transferFrom(
                    landlord,
                    renter,
                    _payoutAmount
                );
                LockNFT(_token).transferFrom(renter, landlord, _tokenId);
            } else {
                revert("landlord does not agree to the refund");
            }
        } else {
            if(request.isRenterAgree == true) {
                require(landlord == msg.sender, "caller should be a landlord");

                IERC20(_payToken).transferFrom(
                    msg.sender,
                    renter,
                    _payoutAmount
                );
                LockNFT(_token).transferFrom(renter, landlord, _tokenId);
            } else {
                revert("renter does not agree to the refund");
            }
        }

        delete (refundRequests[_token][_tokenId][landlord]);
        delete (userOffers[_token][_tokenId][landlord]);

        emit AcceptedRefundToken(_token, landlord, _tokenId, _payoutAmount, isRenter);

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
}