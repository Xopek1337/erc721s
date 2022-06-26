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
  const feeMutltipier = 100;
  const day = 86400;
  const initialBalance = 10000000;

  beforeEach(async () => {
      [deployer, random, random2, unlocker, holder, locker] = await ethers.getSigners();
      // get chainId
      chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

      const MarketInstance = await ethers.getContractFactory('NFTMarketplaceV2', deployer);
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
      const MarketInstanceFail = await ethers.getContractFactory('NFTMarketplaceV2', deployer);
      await expect(MarketInstanceFail.deploy(ZERO_ADDRESS, fee)).to.be.revertedWith('ZERO_ADDRESS');
    });
  });

  
  describe('Functional tests', async function () {
    it('Rent Standart  workflow', async function () {
      const rentTime = 5;
      const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

      const signature = await signRent(
        LockNFT.address,
        erc20.address,
        args.tokenId,
        rentTime,
        args.price,
        0,
        deadline,
        holder
      );

      const signaturePermit = await signPermit(
        holder.address,
        Market.address,
        0,
        deadline,
        holder
      );
      expect(await LockNFT.isApprovedForAll(locker.address, Market.address)).to.be.equal(true);

      expect(await LockNFT.balanceOf(locker.address)).to.be.equal(0);

      const tx = await Market.connect(locker).rent([LockNFT.address, erc20.address, args.tokenId, rentTime, args.price], deadline, signature, signaturePermit);

      expect(await LockNFT.balanceOf(locker.address)).to.be.equal(1);
      
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed;
      const gasPrice = receipt.effectiveGasPrice;
      const gasCostEth = ethers.utils.formatEther(gasPrice * gasUsed);
      
      console.log("USED GAS: ");
      console.log(gasUsed);

      console.log("EFFECTIVE GAS PRICE: ");
      console.log(gasPrice);

      console.log("GAS COST IN ETH: ");
      console.log(gasCostEth);

      const blockNumBefore = await ethers.provider.getBlockNumber();
      const timestampBefore = (await ethers.provider.getBlock(blockNumBefore)).timestamp;
      const PriceWithFee = (await Market.userOffers(args.token, args.tokenId, holder.address)).price;
      const holderProfitWithoutAmount = PriceWithFee - PriceWithFee * fee / feeMutltipier;

      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).endTime).to.be.equal(rentTime*day+timestampBefore);
      expect(holderProfitWithoutAmount).to.be.equal(
        await erc20.balanceOf(holder.address)-initialBalance);
    });

    it('Market permitAll functional', async function () {
      const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

      const signaturePermit = await signPermit(
        holder.address,
        Market.address,
        0,
        deadline,
        holder
      );
      
      expect(await LockNFT.isApprovedForAll(holder.address, Market.address)).to.be.equal(false);

      const tx = await Market.connect(locker).permitAll(LockNFT.address, holder.address, Market.address, deadline, signaturePermit);

      expect(await LockNFT.isApprovedForAll(holder.address, Market.address)).to.be.equal(true);
    });
  });
});

async function signRent(_token, _payToken, tokenId, rentTime, price, nonce, deadline, signer) {
  const typedData = {
    types: {
      Rent: [
        { name: '_token', type: 'address' },
        { name: '_payToken', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'rentTime', type: 'uint256' },
        { name: 'price', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Rent',
    domain: {
      name: "NFTMarketplaceV2",
      version: '1',
      chainId: chainId,
      verifyingContract: Market.address,
    },
    message: {
      _token,
      _payToken,
      tokenId,
      rentTime,
      price,
      nonce,
      deadline,
    },
  };
  
  const signature = await signer._signTypedData(
    typedData.domain,
    { Rent: typedData.types.Rent },
    typedData.message,
  );
  
  return signature;
}

async function signPermit(signer, spender, nonce, deadline, holder) {
  const typedData = {
    types: {
      PermitAll: [
        { name: 'signer', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'PermitAll',
    domain: {
      name: "MockNFT",
      version: '1',
      chainId: chainId,
      verifyingContract: LockNFT.address,
    },
    message: {
      signer,
      spender,
      nonce,
      deadline,
    },
  };
  
  const signature = await holder._signTypedData(
    typedData.domain,
    { PermitAll: typedData.types.PermitAll },
    typedData.message,
  );
  
  return signature;
}