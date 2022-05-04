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

    address public wallet; 
    uint256 public fee;
    uint256 public feeMutltipier = 200;
    uint256 public day = 1 days;
    bool public feePause = false;

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

    constructor(address _wallet, uint256 _fee) {
        require(_wallet != address(0), "ZERO_ADDRESS");

        wallet = _wallet;
        fee = _fee;
    }

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

        LockNFT(_token).transferFrom(msg.sender, address(this), tokenId);

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

        return true;
    }

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
                LockNFT(_token).isApprovedForAll(msg.sender, address(this)),
                "token not approved"
            );
        require(payToken != address(0), "ZERO_ADDRESS");

        for(uint i = 0; i < tokenIds.length; i++) {
            require(userOffers[_token][tokenIds[i]][msg.sender].payToken == address(0), "offer already created");
            require(checkLock(_token, tokenIds[i]), "token is locked");

            LockNFT(_token).transferFrom(msg.sender, address(this), tokenIds[i]);

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
            if(!feePause) {
                IERC20(_payToken).transferFrom(
                    msg.sender,
                    wallet,
                    feeAmount
                );
            }
        } else {
            IERC20(_payToken).transferFrom(
                msg.sender,
                wallet,
                feeAmount
            );
        }

        IERC20(_payToken).transferFrom(
            msg.sender,
            landlord,
            price - feeAmount
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
        
        RequestRefund storage request = refundRequests[_token][_tokenId][landlord];

        if(isRenter) {
            require(LockNFT(_token).ownerOf(_tokenId) == msg.sender, "caller should be arenter");
            
            request.isRenterAgree = true;
            request.payoutAmount = _payoutAmount;
        }
        else {
            require(msg.sender == landlord, "caller should be a landlord");
            require(IERC20(_payToken).allowance(landlord, address(this)) >= _payoutAmount, "pay tokens is not approved");

            request.isLandlordAgree = true;
            request.payoutAmount = _payoutAmount;
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
            } else {
                revert("landlord does not agree to the refund");
            }
        } else {
            if(refundRequests[_token][_tokenId][landlord].isRenterAgree == true) {
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

        RequestExtend storage request = extendRequests[_token][_tokenId][landlord];

        request.isRenterAgree = true;
        request.payoutAmount = _payoutAmount;
        request.extendedTime = _extendedTime;

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
        address renter = LockNFT(_token).ownerOf(_tokenId);
        
        if(extendRequests[_token][_tokenId][landlord].isRenterAgree == true) {
            IERC20(_payToken).transferFrom(
                renter,
                landlord,
                _payoutAmount
            );
            userOffers[_token][_tokenId][landlord].endTime += _extendedTime * day;
        }
        else {
            revert("renter does not agree to the extend rent");
        }

        delete (extendRequests[_token][_tokenId][landlord]);
        return true;
    }

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

    function setFeePause(bool _pause)
        external
        onlyOwner
        returns (bool) 
    {
        feePause = _pause;

        return true;
    }
}