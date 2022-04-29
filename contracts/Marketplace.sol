// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./LockNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract NFTMarketplace is Ownable {
    bytes4 private constant FUNC_SELECTOR = bytes4(keccak256("getLocked(uint256)"));

    address public wallet; 
    uint256 public fee;
    uint256 public feeMutltipier = 200;
    uint256 public day = 86400;

    struct OfferData {
        uint256 minTime;
        uint256 maxTime;
        uint256 startDiscountTime;
        uint256 price;
        uint256 discountPrice;
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

    mapping(address => mapping(uint256 => mapping(address => RequestRefund)))
        public refundRequests;

    mapping(address => mapping(uint256 => mapping(address => RequestExtend)))
        public extendRequests;
    
    mapping(address => mapping(uint256 => mapping(address => OfferData)))
        public userOffers;

    constructor(address _wallet, uint256 _fee) {
        wallet = _wallet;
        fee = _fee;
    }

    function offer(
        address _token, 
        address payToken,
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
        require(checkLock(_token, tokenId), "token is locked");
        require(userOffers[_token][tokenId][msg.sender].payToken == address(0), "offer already created");

        LockNFT(_token).transferFrom(msg.sender, address(this), tokenId);

        userOffers[_token][tokenId][msg.sender] = (OfferData(
            {minTime: minTime, 
            maxTime: maxTime, 
            startDiscountTime: startDiscountTime, 
            price: (price + price * fee / feeMutltipier), 
            discountPrice: (discountPrice + discountPrice * fee / feeMutltipier), 
            endTime: 0, 
            payToken: payToken}
        ));

        return true;
    }

    function offerAll(
        address _token,
        address payToken, 
        uint256[] calldata tokenIds, 
        uint256[] calldata minTimes, 
        uint256[] calldata maxTimes, 
        uint256[] calldata prices
    )
        public
        returns(bool)
    {   
        require(
                LockNFT(_token).isApprovedForAll(msg.sender, address(this)),
                "token not approved"
            );

        for(uint i = 0; i < tokenIds.length; i++) {
            require(userOffers[_token][tokenIds[i]][msg.sender].payToken == address(0), "offer already created");
            require(checkLock(_token, tokenIds[i]), "token is locked");

            LockNFT(_token).transferFrom(msg.sender, address(this), tokenIds[i]);

            userOffers[_token][tokenIds[i]][msg.sender] = (OfferData(
                {minTime: minTimes[i], 
                maxTime: maxTimes[i], 
                startDiscountTime: 0, 
                price: (prices[i] + prices[i] * fee / feeMutltipier), 
                discountPrice: 0, 
                endTime: 0, 
                payToken: payToken}
            ));
        }
        return true;
    }

    function setDiscountData(
        address _token, 
        uint256[] calldata tokenIds, 
        uint256[] calldata startDiscountTimes, 
        uint256[] calldata discountPrices
    )
        public 
        returns(bool)
    {   
        for(uint i = 0; i < tokenIds.length; i++) {
            require(userOffers[_token][tokenIds[i]][msg.sender].payToken != address(0), "offer is not exist");

            userOffers[_token][tokenIds[i]][msg.sender].discountPrice = discountPrices[i] + discountPrices[i] * fee / feeMutltipier;
            userOffers[_token][tokenIds[i]][msg.sender].startDiscountTime = startDiscountTimes[i];
        }
        return true;
    }

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
        require(
                LockNFT(_token).isApprovedForAll(landlord, address(this)),
                "token not approved"
            );
        require(userOffers[_token][tokenId][landlord].payToken != address(0), "offer is not exist");
        require(_payToken == userOffers[_token][tokenId][landlord].payToken, "token is not valid");

        uint price;
        uint feeAmount;

        if(rentTime > userOffers[_token][tokenId][landlord].startDiscountTime) {
            price = userOffers[_token][tokenId][landlord].startDiscountTime * userOffers[_token][tokenId][landlord].price 
            + (rentTime - userOffers[_token][tokenId][landlord].startDiscountTime) * userOffers[_token][tokenId][landlord].discountPrice;
        }
        else {
            price = rentTime * userOffers[_token][tokenId][landlord].price;
        }
        
        require(rentTime >=  userOffers[_token][tokenId][landlord].minTime && rentTime <=  userOffers[_token][tokenId][landlord].maxTime, "invalid rent time");

        feeAmount = price * fee / feeMutltipier;

        IERC20(_payToken).transferFrom(
            msg.sender,
            wallet,
            feeAmount
        );

        IERC20(_payToken).transferFrom(
            msg.sender,
            landlord,
            price
        );

        LockNFT(_token).transferFrom(address(this), msg.sender, tokenId);
        LockNFT(_token).lock(address(this), tokenId);

        userOffers[_token][tokenId][landlord].endTime = rentTime * day + block.timestamp;

        return true;
    }

    function backToken(address _token, address landlord, uint _tokenId)
        public
        returns(bool)
    {
        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(msg.sender == landlord, "only landlord can call back token");
        require(userOffers[_token][_tokenId][landlord].endTime <= block.timestamp, "rent time is not expired");

        address renter = LockNFT(_token).ownerOf(_tokenId);

        LockNFT(_token).transferFrom(renter, landlord, _tokenId);

        delete (userOffers[_token][_tokenId][landlord]);

        return true;
    }

    function backTokenAdmin(address _token, address landlord, uint _tokenId)
        public
        onlyOwner
        returns(bool)
    {
        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(userOffers[_token][_tokenId][landlord].endTime <= block.timestamp, "rent time is not expired");

        address renter = LockNFT(_token).ownerOf(_tokenId);

        LockNFT(_token).transferFrom(renter, landlord, _tokenId);

        delete (userOffers[_token][_tokenId][landlord]);

        return true;
    }

    function requestRefundToken(address _token, address landlord, uint _tokenId, uint _payoutAmount, bool isRenter) 
        public
        returns(bool)
    {   
        address _payToken = userOffers[_token][_tokenId][landlord].payToken;
        require(_payToken != address(0), "offer is not exist");
        
        if(isRenter) {
            require(LockNFT(_token).ownerOf(_tokenId) == msg.sender, "caller should be arenter");
            
            refundRequests[_token][_tokenId][landlord].isRenterAgree = true;
            refundRequests[_token][_tokenId][landlord].payoutAmount = _payoutAmount;
        }
        else {
            require(msg.sender == landlord, "caller should be a landlord");
            require(IERC20(_payToken).allowance(landlord, address(this)) >= _payoutAmount, "pay tokens is not approved");

            refundRequests[_token][_tokenId][landlord].isLandlordAgree = true;
            refundRequests[_token][_tokenId][landlord].payoutAmount = _payoutAmount;
        }

        return true;
    }

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
        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(_payoutAmount == refundRequests[_token][_tokenId][landlord].payoutAmount, "invalid payout amount");

        address _payToken = userOffers[_token][_tokenId][landlord].payToken;
        address renter = LockNFT(_token).ownerOf(_tokenId);

        if(isRenter) {
            if(refundRequests[_token][_tokenId][landlord].isLandlordAgree == true) {
                require(renter == msg.sender, "caller should be a renter");

                IERC20(_payToken).transferFrom(
                    landlord,
                    renter,
                    _payoutAmount
                );
                LockNFT(_token).transferFrom(renter, landlord, _tokenId);
            }
            else {
                revert("landlord does not agree to the refund");
            }
        }
        else {
            if(refundRequests[_token][_tokenId][landlord].isRenterAgree == true) {
                require(landlord == msg.sender, "caller should be a landlord");

                IERC20(_payToken).transferFrom(
                    msg.sender,
                    renter,
                    _payoutAmount
                );
                LockNFT(_token).transferFrom(renter, landlord, _tokenId);
            }
            else {
                revert("renter does not agree to the refund");
            }
        }

        delete (userOffers[_token][_tokenId][landlord]);

        return true;
    }

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

        extendRequests[_token][_tokenId][landlord].isRenterAgree = true;
        extendRequests[_token][_tokenId][landlord].payoutAmount = _payoutAmount;
        extendRequests[_token][_tokenId][landlord].extendedTime = _extendedTime;

        return true;
    }

    function acceptExtendRent(address _token, address landlord, uint _tokenId, uint _payoutAmount, bool isRenter) 
        public
        returns(bool)
    {
        require(userOffers[_token][_tokenId][landlord].payToken != address(0), "offer is not exist");
        require(landlord == msg.sender, "caller should be a landlord");
        require(_payoutAmount == extendRequests[_token][_tokenId][landlord].payoutAmount, "invalid payout amount");

        address _payToken = userOffers[_token][_tokenId][landlord].payToken;
        uint _extendedTime = extendRequests[_token][_tokenId][landlord].extendedTime;

        if(extendRequests[_token][_tokenId][landlord].isRenterAgree == true) {
            IERC20(_payToken).transferFrom(
                msg.sender,
                landlord,
                _payoutAmount
            );
            userOffers[_token][_tokenId][landlord].endTime += _extendedTime * day;
        }
        else {
            revert("renter does not agree to the extend rent");
        }

        return true;
    }

    function isLockingContract(address _contract) 
        public
        returns(bool)
    {
        bool success;
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
        return success;
    }

    function checkLock(address _token, uint256 tokenId) 
        public
        returns(bool)
    {
        require(isLockingContract(_token), "contract does not support locking");
        address locker = ERC721s(_token).getLocked(tokenId);

        return locker == address(0) ? true : false;
    }

    function setWallet(address _wallet)
        external
        onlyOwner
        returns (bool) 
    {
        wallet = _wallet;

        return true;
    }

    function setFee(uint256 _fee)
        external
        onlyOwner
        returns (bool) 
    {
        fee = _fee;

        return true;
    }
}