// Load dependencies
const { expect } = require('chai');

// Import utilities from Test Helpers
const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { deployments, getNamedAccounts, ethers } = require('hardhat');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');

const toBN = ethers.BigNumber.from;

describe('Market for ERC721s NFT tests', () => {
  let deployer;
  let random;
  let random2;
  let unlocker;
  let holder;
  let locker;
  const ADDRESS_ZERO = ethers.constants.AddressZero;
  const mybase = "https://mybase.com/json/";

  let args = {
    token: undefined,
    paytoken: undefined,
    tokenId: undefined,
    tokenIds: undefined,
    minTime: 1,
    maxTime: 1000,
    startDiscountTime: 500,
    price: 100,
    discountPrice: 90
  };

  const fee = 10;
  const feeMutltipier = 200;
  const day = 86400;
  const initialBalance = 10000000;

  beforeEach(async () => {
      [deployer, random, random2, unlocker, holder, locker] = await ethers.getSigners();
      // get chainId
      chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

      const MarketInstance = await ethers.getContractFactory('NFTMarketplace', deployer);
      const LockNFTInstance = await ethers.getContractFactory('LockNFT');
      const ERC20Instance = await ethers.getContractFactory('ERC20G');

      LockNFT = await LockNFTInstance.deploy(mybase);
      Market = await MarketInstance.deploy(deployer.address, fee);
      erc20 = await ERC20Instance.deploy([deployer.address, random.address, random2.address, unlocker.address, holder.address, locker.address]);

      args.token = LockNFT.address;
      args.paytoken = erc20.address;

      //prepare
      await erc20.connect(locker).approve(Market.address, initialBalance);
      await erc20.connect(holder).approve(Market.address, initialBalance);
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      args.tokenId = (await LockNFT.totalSupply()) - 1;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);
      await LockNFT.connect(locker).setApprovalForAll(Market.address, true);
  });

  describe('Deployment', async function () {
    it('deploys', async function () {
        expect(Market.address).to.not.equal("");
    });
    it('stores correct wallet address', async function () {
      expect(await Market.wallet()).to.equal(deployer.address);
    });
    it('deploys NFT', async function () {
        expect(LockNFT.address).to.not.equal("");
    });
    it('deploys with correct base URI', async function () {
      expect(await LockNFT.tokenURI(await LockNFT.totalSupply() - 1)).to.include(mybase);
    });
    it('deploys with 0 tokens', async function () {
      expect(await LockNFT.totalSupply()).to.equal(3);
    });
    it('PayToken is deployed correctly', async function () {
      expect(await erc20.address).to.not.equal("");
      expect(await erc20.balanceOf(deployer.address)).to.be.equal(initialBalance);
    });
    it('Failed deployment if wallet is zero address', async function () {
      const MarketInstanceFail = await ethers.getContractFactory('NFTMarketplace', deployer);
      await expect(MarketInstanceFail.deploy(ZERO_ADDRESS, fee)).to.be.revertedWith('ZERO_ADDRESS');
    });
  });

  //functional tests
  describe('Offer functional tests', async function () {
    it('Offer creates correctly', async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).price).to.be.equal(Math.trunc(
        args.price + args.price * fee / feeMutltipier));
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(Math.trunc(
        args.discountPrice + args.discountPrice * fee / feeMutltipier));
    });

    it('Offer for non approved token negative', async function () {
      await LockNFT.connect(holder).setApprovalForAll(Market.address, false);
      
      await expect(Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith('token not approved');
    });

    it('Offer is not created twice negative', async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      
      //same offer second time
      await expect(Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith('offer already created');
    });

    it('Offer with zero address paytoken reverts negative', async function () {
      await expect(Market.connect(holder).offer(args.token, ZERO_ADDRESS, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith('ZERO_ADDRESS');
    });

    it('Offer locked token reverts negative', async function () {
      await LockNFT.connect(holder).lock(await unlocker.getAddress(), args.tokenId);

      await expect(Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith('token is locked');
    });
  });

  describe('Offer All functional tests', async function () {
    it('OfferAll creates correctly', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      expect((await Market.userOffers(args.token, args.tokenId-1, holder.address)).payToken).to.be.equal(args.paytoken);
    });

    it('OfferAll for non approved token negative', async function () {
      await LockNFT.connect(holder).setApprovalForAll(Market.address, false);
      
      await expect(Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price])).to.be.revertedWith('token not approved');
    });
    //NOTE: if cycle drops on last element, all previous are created and written to offerAll
    it('OfferAll already offered token negative', async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      await expect(Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId-1, args.tokenId], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price])).to.be.revertedWith('offer already created');
    });

    it('OfferAll for locked token token negative', async function () {
      await LockNFT.connect(holder).lock(unlocker.address, args.tokenId);
      
      await expect(Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price])).to.be.revertedWith('token is locked');
    });

    it('OfferAll with zero address paytoken reverts negative', async function () {
      await expect(Market.connect(holder).offerAll(args.token, ZERO_ADDRESS, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price])).to.be.revertedWith('ZERO_ADDRESS');
    });

    it('OfferAll wity invalid argument count negative', async function () {
      await expect(Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1, args.tokenId-2], [args.minTime], 
        [args.maxTime, args.maxTime, args.maxTime], [args.price, args.price, args.price])).to.be.revertedWith('arrays must be the same length');
    });
  });

  describe('SetDiscountData functional tests', async function () {
    it('SetDiscountData holder can set discount for their offer', async function () {
      await Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);

      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(
        Math.trunc(args.price + args.price * fee / feeMutltipier));

      await Market.connect(holder).setDiscountData(args.token, [args.tokenId, args.tokenId-1], [args.startDiscountTime, 
        args.startDiscountTime], [args.discountPrice, args.discountPrice]);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).startDiscountTime).to.be.equal(args.startDiscountTime);    
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(
        Math.trunc(args.discountPrice + args.discountPrice * fee / feeMutltipier));
    });

    it('SetDiscountData random can not set discount for holder offer negative', async function () {
      await Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);

      await expect(Market.connect(random).setDiscountData(args.token, [args.tokenId, args.tokenId-1], [args.startDiscountTime, 
        args.startDiscountTime], [args.discountPrice, args.discountPrice])).to.be.revertedWith('offer is not exist');
    });

    it('SetDiscountData wity invalid argument count negative', async function () {
      await Market.connect(holder).offerAll(args.token, args.paytoken, ZERO_ADDRESS, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);

      await expect(Market.connect(random).setDiscountData(args.token, [args.tokenId, args.tokenId-1], [args.startDiscountTime, 
        args.startDiscountTime], [args.discountPrice])).to.be.revertedWith('arrays must be the same length');
    });
  });

  describe('Rent functional tests', async function () {
    it('Rent Standart  workflow rentTime<startDiscountTime', async function () {
      const rentTime = 500;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      expect(await LockNFT.isApprovedForAll(locker.address, Market.address)).to.be.equal(true);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;
      const PriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).price;
      const holderProfit = PriceWithFee * rentTime;
      const holderProfitWithoutAmount = holderProfit - holderProfit * fee / feeMutltipier;

      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).endTime).to.be.equal(rentTime*day+timestampBefore);
      expect(holderProfitWithoutAmount).to.be.equal(
        await erc20.balanceOf(holder.address)-initialBalance);
    });

    it('Rent standart workflow rentTime>startDiscountTime', async function () {
      const rentTime = 600;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;
      const PriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).price;
      const discountPriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice;
      const holderProfit = (PriceWithFee * (args.startDiscountTime) + (rentTime - args.startDiscountTime) * discountPriceWithFee);
      const holderProfitWithoutAmount = holderProfit - holderProfit * fee / feeMutltipier;

      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).endTime).to.be.equal(rentTime*day+timestampBefore);      
      expect(holderProfitWithoutAmount).to.be.equal(
        await erc20.balanceOf(holder.address)-initialBalance);
    });

    it('Rent passtoken is not zero address', async function () {
      const AnyNFTInstance = await ethers.getContractFactory('LockNFT');
      AnyNFT = await AnyNFTInstance.deploy(mybase);
      const rentTime = 600;
      const passToken = AnyNFT.address;
      await AnyNFT.connect(locker).mint(await locker.getAddress(), 3);

      expect(await AnyNFT.balanceOf(locker.address)).to.be.equal(3);

      await Market.connect(holder).offer(args.token, args.paytoken, passToken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(deployer).setFeePause(true);

      expect(await Market.feePause()).to.be.equal(true);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
            
      const WalletProfit = (await erc20.balanceOf(await Market.wallet())) - initialBalance;

      expect(WalletProfit).to.be.equal(0);
    });

    it('Rent passtoken not zero, but fee not paused', async function () {
      const AnyNFTInstance = await ethers.getContractFactory('LockNFT');
      AnyNFT = await AnyNFTInstance.deploy(mybase);
      const rentTime = 600;
      const passToken = AnyNFT.address;
      await AnyNFT.connect(locker).mint(await locker.getAddress(), 3);
      await Market.connect(holder).offer(args.token, args.paytoken, passToken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      const PriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).price;
      const discountPriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice;
      const holderProfit = (PriceWithFee * (args.startDiscountTime) + (rentTime - args.startDiscountTime) * discountPriceWithFee);
      const PredictionProfit = holderProfit * fee / feeMutltipier;
      
      const WalletProfit = (await erc20.balanceOf(await Market.wallet())) - initialBalance;
      expect(PredictionProfit).to.be.equal(WalletProfit);
    });

  it('Rent locker has no passToken negative', async function () {
      const AnyNFTInstance = await ethers.getContractFactory('LockNFT');
      AnyNFT = await AnyNFTInstance.deploy(mybase);
      const rentTime = 600;
      const passToken = AnyNFT.address;
      await Market.connect(holder).offer(args.token, args.paytoken, passToken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(deployer).setFeePause(true);

      await expect(Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime)).to.be.revertedWith(
        'renter does not have pass token');
    });

    it('Rent if renter didnt approved market negative', async function () {
      const rentTime = 600;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      await LockNFT.connect(locker).setApprovalForAll(Market.address, false);
      
      await expect(Market.connect(locker).rent(args.token, holder.address, args.paytoken, 
        args.tokenId, rentTime)).to.be.revertedWith('token not approved');
    });

    it('Rent for non-existent offer negative', async function () {
      const rentTime = 600;
            
      await expect(Market.connect(locker).rent(args.token, holder.address, args.paytoken, 
        args.tokenId, rentTime)).to.be.revertedWith('offer is not exist');
    });

    it('Rent with wrong payToken negative', async function () {
      const rentTime = 600;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
            
      await expect(Market.connect(locker).rent(args.token, holder.address, ZERO_ADDRESS, 
        args.tokenId, rentTime)).to.be.revertedWith('token is not valid');
    });

    it('Rent with wrong rentTime negative', async function () {
      const rentTime = 1111;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
            
      await expect(Market.connect(locker).rent(args.token, holder.address, args.paytoken, 
        args.tokenId, rentTime)).to.be.revertedWith('invalid rent time');
    });
  });

  describe("BackToken tests", async function () {
    it("backToken functional default", async function () {
      //offer-rent logic
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      expect(await Market.userOffers(args.token, args.tokenId, holder.address).payToken).not.to.be.equal(ZERO_ADDRESS);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      //time travel
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;

      await ethers.provider.send('evm_increaseTime', [rentTime*day]);
      await ethers.provider.send('evm_mine');

      const blockNumNow = await ethers.provider.getBlockNumber();
      const timestampNow = (await ethers.provider.getBlock(blockNumNow)).timestamp;

      expect(Math.trunc((timestampNow - timestampBefore)/10)).to.be.equal(Math.trunc(rentTime*day/10));

      await Market.connect(holder).backToken(args.token, holder.address, args.tokenId);

      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(holder.address);
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(ZERO_ADDRESS);
    });

    it("backToken non-existent offer negative", async function () {
      await expect(Market.connect(holder).backToken(args.token, holder.address, 
        args.tokenId)).to.be.revertedWith('offer is not exist');
    });

    it("backToken not landlord negative", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      await expect(Market.connect(random).backToken(args.token, holder.address, 
        args.tokenId)).to.be.revertedWith('only landlord or admin can call back token');
    });

    it("backToken offer endTime not expired negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      
      await expect(Market.connect(holder).backToken(args.token, holder.address, 
        args.tokenId)).to.be.revertedWith('rent time is not expired');
    });


  });

  describe("BackTokenAdmin tests", async function () {
    it("backTokenAdmin functional default", async function () {
      //offer-rent logic
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      expect(await Market.userOffers(args.token, args.tokenId, holder.address).payToken).not.to.be.equal(ZERO_ADDRESS);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      //time travel
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;

      await ethers.provider.send('evm_increaseTime', [rentTime*day]);
      await ethers.provider.send('evm_mine');

      const blockNumNow = await ethers.provider.getBlockNumber();
      const timestampNow = (await ethers.provider.getBlock(blockNumNow)).timestamp;

      expect(Math.trunc((timestampNow - timestampBefore)/10)).to.be.equal(Math.trunc(rentTime*day/10));

      await Market.connect(deployer).backToken(args.token, holder.address, args.tokenId);

      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(holder.address);
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(ZERO_ADDRESS);
    });

    it("backTokenAdmin non-existent offer negative", async function () {
      await expect(Market.connect(deployer).backToken(args.token, holder.address, 
        args.tokenId)).to.be.revertedWith('offer is not exist');
    });

    it("backTokenAdmin not admin negative", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      await expect(Market.connect(random).backToken(args.token, holder.address, 
        args.tokenId)).to.be.revertedWith('only landlord or admin can call back token');
    });

    it("backTokenAdmin offer endTime not expired negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      
      await expect(Market.connect(deployer).backToken(args.token, holder.address, 
        args.tokenId)).to.be.revertedWith('rent time is not expired');
    });
  });

  describe("RefundToken tests", async function () {
    it("request+accept invoked by renter scen default", async function () {
      //offer-rent logic
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      expect(await Market.userOffers(args.token, args.tokenId, holder.address).payToken).not.to.be.equal(ZERO_ADDRESS);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      //time travel
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;

      await ethers.provider.send('evm_increaseTime', [rentTime*day]);
      await ethers.provider.send('evm_mine');

      const blockNumNow = await ethers.provider.getBlockNumber();
      const timestampNow = (await ethers.provider.getBlock(blockNumNow)).timestamp;

      expect(Math.trunc((timestampNow - timestampBefore)/10)).to.be.equal(Math.trunc(rentTime*day/10));
      
      const payAmount = 1000;
      await Market.connect(locker).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, true);
      
      expect((await Market.refundRequests(args.token, args.tokenId, holder.address)).payoutAmount).to.be.equal(payAmount);
      expect((await Market.refundRequests(args.token, args.tokenId, holder.address)).isRenterAgree).to.be.equal(true);
      
      const lockerBalance = await erc20.balanceOf(locker.address);
      await Market.connect(holder).acceptRefundToken(args.token, holder.address, args.tokenId, payAmount, false);

      expect(parseInt(lockerBalance)+1000).to.be.equal(await erc20.balanceOf(locker.address));
      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(holder.address);
    });

    it("request+accept invoked by landlord scen default", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      
      const payAmount = 1000;
      await Market.connect(holder).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, false);
      
      expect((await Market.refundRequests(args.token, args.tokenId, holder.address)).isLandlordAgree).to.be.equal(true);
      
      const lockerBalance = await erc20.balanceOf(locker.address);
      await Market.connect(locker).acceptRefundToken(args.token, holder.address, args.tokenId, payAmount, true);

      expect(parseInt(lockerBalance)+1000).to.be.equal(await erc20.balanceOf(locker.address));
      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(holder.address);
    });

    it("requestRefund by landlord", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      const payAmount = 1000;
      await Market.connect(holder).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, false);
      
      expect((await Market.refundRequests(args.token, args.tokenId, holder.address)).payoutAmount).to.be.equal(payAmount);
      expect((await Market.refundRequests(args.token, args.tokenId, holder.address)).isLandlordAgree).to.be.equal(true);
    });

    it("requestRefund non-existent offer negative", async function () {
      const payAmount = 1000;
      await expect(Market.connect(locker).requestRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, true)).to.be.revertedWith('offer is not exist');
    });

    it("requestRefund by random negative", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      const payAmount = 1000;
      await expect(Market.connect(random).requestRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, true)).to.be.revertedWith('caller should be a renter');
    });

    it("requestRefund by not landlord negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      const payAmount = 1000;
      await expect(Market.connect(locker).requestRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, false)).to.be.revertedWith('caller should be a landlord');
    });

    it("requestRefund by landlord zero approved balance negative", async function () {
      const rentTime = 1;
      await erc20.connect(holder).approve(Market.address, 0);
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      const payAmount = 1000;
      await expect(Market.connect(holder).requestRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, false)).to.be.revertedWith('pay tokens is not approved');
    });
  });

  describe("acceptRefund tests", async function () {
    it("acceptRefund request not exist negative", async function () {
      const payAmount = 1000;
      await expect(Market.connect(locker).acceptRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, true)).to.be.revertedWith('offer is not exist');
    });

    it("acceptRefund payamount invalid negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);


      const payAmount = 1000;
      await Market.connect(locker).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, true);

      await expect(Market.connect(locker).acceptRefundToken(args.token, holder.address, args.tokenId, 
        payAmount-100, true)).to.be.revertedWith('invalid payout amount');
    });

    it("acceptRefund by random (request by locker) negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);


      const payAmount = 1000;
      await Market.connect(locker).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, true);

      await expect(Market.connect(random).acceptRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, false)).to.be.revertedWith('caller should be a landlord');
    });

    it("acceptRefund by random (request by landlord) negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);


      const payAmount = 1000;
      await Market.connect(holder).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, false);

      await expect(Market.connect(random).acceptRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, true)).to.be.revertedWith('caller should be a renter');
    });


    it("acceptRefund landlord is not agree negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);


      const payAmount = 1000;
      await Market.connect(locker).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, true);

      await expect(Market.connect(locker).acceptRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, true)).to.be.revertedWith('landlord does not agree to the refund');
    });

    it("acceptRefund renter is not agree negative", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      const payAmount = 1000;
      await Market.connect(holder).requestRefundToken(args.token, holder.address, args.tokenId, payAmount, false);

      await expect(Market.connect(holder).acceptRefundToken(args.token, holder.address, args.tokenId, 
        payAmount, false)).to.be.revertedWith('renter does not agree to the refund');
    });
  });


  describe("ExtendRent tests", async function () {
    it("request functional default", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      expect(await Market.userOffers(args.token, args.tokenId, holder.address).payToken).not.to.be.equal(ZERO_ADDRESS);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      
      const _payAmount = 1000;
      const _extendedTime = 100;
      await Market.connect(locker).requestExtendRent(args.token, holder.address, args.tokenId, _payAmount, _extendedTime);
      
      expect((await Market.extendRequests(args.token, args.tokenId, holder.address)).payoutAmount).to.be.equal(_payAmount);
      expect((await Market.extendRequests(args.token, args.tokenId, holder.address)).isRenterAgree).to.be.equal(true);
      expect((await Market.extendRequests(args.token, args.tokenId, holder.address)).extendedTime).to.be.equal(_extendedTime);
    });

    it("request-accept scen default", async function () {
      //offer-rent logic
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      expect(await Market.userOffers(args.token, args.tokenId, holder.address).payToken).not.to.be.equal(ZERO_ADDRESS);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      
      const _payAmount = 1000;
      const _extendedTime = 100;
      await Market.connect(locker).requestExtendRent(args.token, holder.address, args.tokenId, _payAmount, _extendedTime);
      
      expect((await Market.extendRequests(args.token, args.tokenId, holder.address)).payoutAmount).to.be.equal(_payAmount);
      expect((await Market.extendRequests(args.token, args.tokenId, holder.address)).isRenterAgree).to.be.equal(true);
      expect((await Market.extendRequests(args.token, args.tokenId, holder.address)).extendedTime).to.be.equal(_extendedTime);

      const holderBalance = await erc20.balanceOf(holder.address);
      await Market.connect(holder).acceptExtendRent(args.token, holder.address, args.tokenId, _payAmount);
      
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;

      expect(Math.trunc((await Market.userOffers(args.token, args.tokenId, holder.address)).endTime/1000)).to.be.equal(
        Math.trunc((timestampBefore + (rentTime + _extendedTime) * day)/1000));

      expect(parseInt(holderBalance)+_payAmount).to.be.equal(await erc20.balanceOf(holder.address));
      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(locker.address);
    });

    it("requestExtendRent offer not exists negative", async function () {
      const _payAmount = 1000;
      const _extendedTime = 100;
      await expect(Market.connect(holder).requestExtendRent(args.token, holder.address, args.tokenId, _payAmount, 
        _extendedTime)).to.be.revertedWith('offer is not exist');
    });

    it("requestExtendRent offer not exists negative", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      const _payAmount = 1000;
      const _extendedTime = 100;
      await expect(Market.connect(random).requestExtendRent(args.token, holder.address, args.tokenId, _payAmount, 
        _extendedTime)).to.be.revertedWith('caller should be a renter');
    });
  });

  describe("acceptExtendRent tests", async function () {
    it("acceptExtendRent offer not exists negative", async function () {
      await expect(Market.connect(holder).acceptExtendRent(args.token, holder.address, args.tokenId, 
        0)).to.be.revertedWith('offer is not exist');
    });

    it("acceptExtendRent offer not landlord negative", async function () {
      const rentTime = 1;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      const _payAmount = 1000;
      const _extendedTime = 100;
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      await Market.connect(locker).requestExtendRent(args.token, holder.address, args.tokenId, _payAmount, _extendedTime);

      await expect(Market.connect(random).acceptExtendRent(args.token, holder.address, args.tokenId, 
        0)).to.be.revertedWith('caller should be a landlord');
    });

    it("acceptExtendRent invalid payamount negative", async function () {
      const rentTime = 1;
      const _payAmount = 1000;
      const _extendedTime = 100;
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      await Market.connect(locker).requestExtendRent(args.token, holder.address, args.tokenId, _payAmount, _extendedTime);

      await expect(Market.connect(holder).acceptExtendRent(args.token, holder.address, args.tokenId, 
        0)).to.be.revertedWith('invalid payout amount');
    });

    it("acceptExtendRent renter is not agree negative", async function () {
      await Market.connect(holder).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      await expect(Market.connect(holder).acceptExtendRent(args.token, holder.address, args.tokenId, 
        0)).to.be.revertedWith('renter does not agree to the extend rent');
    });
  });

  describe("checkLock tests", async function () {
    it("checkLock negative", async function () {
      await expect(Market.checkLock(erc20.address, args.tokenId)).to.be.revertedWith(
        "contract does not support locking");
    });
  });

  describe("setWallet tests", async function () {
    it("Sets wallet", async function () {
      await Market.connect(deployer).setWallet(deployer.address);
      expect(await Market.wallet()).to.be.equal(deployer.address);
    });

    it("Fails if not onwer negative", async function () {
      await expect(Market.connect(random).setWallet(random.address)).to.be.revertedWith(
        "Ownable: caller is not the owner");
    });
  });

  describe("setFee tests", async function () {
    it("sets Fee", async function () {
      const anotherFee = 20;
      await Market.connect(deployer).setFee(anotherFee);
      expect(await Market.fee()).to.be.equal(anotherFee);
    });

    it("Fails if not onwer negative", async function () {
      const anotherFee = 200;
      await expect(Market.connect(random).setFee(anotherFee)).to.be.revertedWith(
        "Ownable: caller is not the owner");
    });
  });

  describe("setFeePause tests", async function () {
    it("setFeePause true", async function () {
      const status = true;
      await Market.connect(deployer).setFeePause(status);

      expect(await Market.feePause()).to.be.equal(status);
    });
  });
});