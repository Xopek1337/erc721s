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
      [deployer, random, random2, unlocker, holder, locker, renter, landlord] = await ethers.getSigners();
      // get chainId
      chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

      const MarketInstance = await ethers.getContractFactory('NFTMarketplace', deployer);
      const LockNFTInstance = await ethers.getContractFactory('LockNFT');
      const ERC20Instance = await ethers.getContractFactory('ERC20G');

      LockNFT = await LockNFTInstance.deploy(mybase);
      Market = await MarketInstance.deploy(deployer.address, fee);
      erc20 = await ERC20Instance.deploy([deployer.address, random.address, random2.address, unlocker.address, landlord.address, renter.address]);

      args.token = LockNFT.address;
      args.paytoken = erc20.address;


      //mint
      await LockNFT.connect(landlord).mint(await landlord.getAddress(), 3);
      args.tokenId = (await LockNFT.totalSupply()) - 1;
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
  describe('Main Scenario test', async function () {
    it('Offer creates correctly', async function () {

      //prepare
      await erc20.connect(renter).approve(Market.address, initialBalance);
      await erc20.connect(landlord).approve(Market.address, initialBalance);

      //approval to offer
      await LockNFT.connect(landlord).setApprovalForAll(Market.address, true);
      
      await LockNFT.connect(renter).setApprovalForAll(Market.address, true);

      //offer
      await Market.connect(landlord).offer(args.token, args.paytoken, ZERO_ADDRESS, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      //checks, nft on landlord
      expect((await Market.userOffers(args.token, args.tokenId, landlord.address)).payToken).to.be.equal(args.paytoken);
      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(landlord.address);

      const rentTime = 500;
      
      expect(await LockNFT.isApprovedForAll(landlord.address, Market.address)).to.be.equal(true);
      
      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(landlord.address);

      await Market.connect(renter).rent(args.token, landlord.address, args.paytoken, args.tokenId, rentTime);

      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(renter.address);


      //time travel
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;

      await ethers.provider.send('evm_increaseTime', [rentTime*day]);
      await ethers.provider.send('evm_mine');

      const blockNumNow = await ethers.provider.getBlockNumber();
      const timestampNow = (await ethers.provider.getBlock(blockNumNow)).timestamp;
      
      expect(Math.trunc((timestampNow - timestampBefore)/10)).to.be.equal(Math.trunc(rentTime*day/10));

      await Market.connect(landlord).backToken(args.token, landlord.address, args.tokenId);

      expect(await LockNFT.ownerOf(args.tokenId)).to.be.equal(landlord.address);
      expect((await Market.userOffers(args.token, args.tokenId, landlord.address)).payToken).to.be.equal(ZERO_ADDRESS);  
      
    });

    
  });

  
});
  