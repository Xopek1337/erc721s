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
    maxTime: 10,
    startDiscountTime: 5,
    price: 100,
    discountPrice: 90
  };


async function signPermitLock(locker, tokenId, nonce, deadline, signer) {
  const typedData = {
    types: {
        Permit: [
            { name: 'locker', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
    },
    primaryType: 'Permit',
    domain: {
        name: "MockNFT",
        version: '1',
        chainId: chainId,
        verifyingContract: nftContract.address,
    },
    message: {
        locker,
        tokenId,
        nonce,
        deadline,
    },
  };

  const signature = await signer._signTypedData(
      typedData.domain,
      { Permit: typedData.types.Permit },
      typedData.message,
  );

  return signature;
}

async function signPermit(spender, tokenId, nonce, deadline, signer) {
  const typedData = {
    types: {
        Permit: [
            { name: 'spender', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
    },
    primaryType: 'Permit',
    domain: {
        name: await nftContract.name(),
        version: '1',
        chainId: chainId,
        verifyingContract: nftContract.address,
    },
    message: {
        spender,
        tokenId,
        nonce,
        deadline,
    },
  };

  const signature = await signer._signTypedData(
      typedData.domain,
      { Permit: typedData.types.Permit },
      typedData.message,
  );

  return signature;
}

async function signPermitAll(signer, spender, nonce, deadline, holder) {
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
          name: await nftContract.name(),
          version: '1',
          chainId: chainId,
          verifyingContract: nftContract.address,
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


  beforeEach(async () => {
      [deployer, random, random2, unlocker, holder, locker] = await ethers.getSigners();
      const fee = 10;
      // get chainId
      chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

      const NFTMarketplaceInstance = await ethers.getContractFactory('NFTMarketplace', deployer);
      Market = await NFTMarketplaceInstance.deploy(deployer.address, fee);

      const LockNFTInstance = await ethers.getContractFactory('LockNFT');
      LockNFT = await LockNFTInstance.deploy(mybase);

      //legacy
      const nftContractInstance = await ethers.getContractFactory('LockNFT');
      nftContract = await nftContractInstance.deploy(mybase);

      let PayTokenAddress = "0xC480B32B4f6354B1479524114d6b284B57D81117";

      args.token = LockNFT.address;
      args.paytoken = PayTokenAddress;
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
  });


  //functional tests
  describe('offer functional tests', async function () {
    it('Offer creates correctly', async function () {
      await LockNFT.connect(holder).mint(await holder.getAddress(), 3);
      let testedTokenId = (await LockNFT.totalSupply()) - 1;
      args.tokenId = testedTokenId;
      await LockNFT.connect(holder).setApprovalForAll(Market.address, true);

      await Market.connect(holder).offer(args.token, args.paytoken, args.tokenId, args.minTime, args.maxTime, 
        args.startDiscountTime, args.price, args.discountPrice);
      
      expect((await Market.userOffers(args.token, args.tokenId, holder.address)).payToken).to.be.equal(args.paytoken);
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
  });
});
  