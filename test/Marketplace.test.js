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
    token: null,
    paytoken: null,
    tokenId: null,
    tokenIds: null,
    minTime: 1,
    maxTime: 1000,
    startDiscountTime: 500,
    price: 100,
    discountPrice: 90
  };

  const fee = 10;
  const feeMutltipier = 200;
  const day = 86400;


  beforeEach(async () => {
      [deployer, random, random2, unlocker, holder, locker] = await ethers.getSigners();
      // get chainId
      chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

      const NFTMarketplaceInstance = await ethers.getContractFactory('NFTMarketplace', deployer);
      Market = await NFTMarketplaceInstance.deploy(deployer.address, fee);

      const LockNFTInstance = await ethers.getContractFactory('LockNFT');
      LockNFT = await LockNFTInstance.deploy(mybase);

      //legacy
      // const nftContractInstance = await ethers.getContractFactory('LockNFT');
      // nftContract = await nftContractInstance.deploy(mybase);

      const ERC20Instance = await ethers.getContractFactory('ERC20G');
      erc20 = await ERC20Instance.deploy([deployer.address, random.address, random2.address, unlocker.address, holder.address, locker.address]);

      args.token = LockNFT.address;
      args.paytoken = erc20.address;
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
      const mintQty = 3;
      await LockNFT.connect(random).mint(await random.getAddress(), mintQty);
      expect(await LockNFT.tokenURI(await LockNFT.totalSupply() - 1)).to.include(mybase);
    });
    it('deploys with 0 tokens', async function () {
      expect(await LockNFT.totalSupply()).to.equal(0);
    });
    it('PayToken is deployed correctly', async function () {
      expect(await erc20.address).to.not.equal("");
      expect(await erc20.balanceOf(deployer.address)).to.be.equal(10000000);
    });
  });

  //functional tests
  describe('Offer functional tests', async function () {
    it('Offer creates correctly', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).price).to.be.equal(Math.trunc(
        args.price + args.price * fee / feeMutltipier));
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(Math.trunc(
        args.discountPrice + args.discountPrice * fee / feeMutltipier));
    });

    it('Offer is not created twice negative', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      
      //same offer second time
      await expect(Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith('offer already created');
    });

    it('Offer with zero address paytoken reverts negative', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await expect(Market.connect(holder).offer(args.token, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith();
    });

    it('Offer locked token reverts negative', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;

      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);
      await LockNFT.connect(holder).lock(await unlocker.getAddress(), testedTokenId);

      await expect(Market.connect(holder).offer(args.token, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice)).to.be.revertedWith('token is locked');
    });
  });

  describe('Offer All functional tests', async function () {
    it('Offer All creates correctly', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offerAll(args.token, args.paytoken, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      expect((await Market.userOffers(args.token, args.tokenId-1, holder.address)).payToken).to.be.equal(args.paytoken);
    });

    it('Offer All wity only one price', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offerAll(args.token, args.paytoken, [args.tokenId, args.tokenId-1, args.tokenId-2], [args.minTime], 
        [args.maxTime], [args.price]);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
      expect((await Market.userOffers(args.token, args.tokenId-1, holder.address)).payToken).to.be.equal(args.paytoken);
    });
  });

  describe('SetDiscountData functional tests', async function () {
    it('Holder can set discount for their offer', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offerAll(args.token, args.paytoken, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);
      //#TODO Default value for discount time is 0 
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(0);

      await Market.connect(holder).setDiscountData(args.token, [args.tokenId, args.tokenId-1], [args.startDiscountTime, 
        args.startDiscountTime], [args.discountPrice, args.discountPrice]);
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).startDiscountTime).to.be.equal(args.startDiscountTime);    
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(
        Math.trunc(args.discountPrice + args.discountPrice * fee / feeMutltipier));
    });

    it('Random can not set discount for holder offer negative', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offerAll(args.token, args.paytoken, [args.tokenId, args.tokenId-1], [args.minTime, args.minTime], 
        [args.maxTime, args.maxTime], [args.price, args.price]);
      //#TODO Default value for discount time is 0 
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice).to.be.equal(0);

      await expect(Market.connect(random).setDiscountData(args.token, [args.tokenId, args.tokenId-1], [args.startDiscountTime, 
        args.startDiscountTime], [args.discountPrice, args.discountPrice])).to.be.revertedWith('offer is not exist');
    });
  });

  describe('Rent functional tests', async function () {
    it('Standart rent workflow rentTime<startDiscountTime', async function () {
      const rentTime = 500;
      await erc20.connect(locker).approve(Market.address, 100000000);
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      args.tokenId = (await LockNFT.totalSupply()) - 1;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);
      await Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      expect(await LockNFT.isApprovedForAll(holder.address, Market.address)).to.be.equal(true);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).endTime).to.be.equal(rentTime*day+timestampBefore);
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).price * rentTime).to.be.equal(
        await erc20.balanceOf(holder.address)-10000000);
    });

    it('Standart rent workflow rentTime>startDiscountTime', async function () {
      const rentTime = 600;
      await erc20.connect(locker).approve(Market.address, 100000000);
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      args.tokenId = (await LockNFT.totalSupply()) - 1;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);
      await Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);

      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;
      const PriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).price;
      const discountPriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).discountPrice;

      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).endTime).to.be.equal(rentTime*day+timestampBefore);      
      expect(PriceWithFee * (args.startDiscountTime) + (rentTime - args.startDiscountTime) * discountPriceWithFee).to.be.equal(
        await erc20.balanceOf(holder.address)-10000000);
    });
  });

  describe("BackToken functional", async function () {
    it("backToken default", async function () {
      //offer-rent logic
      const rentTime = 500;
      await erc20.connect(locker).approve(Market.address, 100000000);
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      args.tokenId = (await LockNFT.totalSupply()) - 1;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);
      await Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      await Market.connect(locker).rent(args.token, holder.address, args.paytoken, args.tokenId, rentTime);

      //start backToken process
    });
  });
});
  