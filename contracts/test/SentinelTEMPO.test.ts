import { expect } from "chai"
import hre from "hardhat"
const { ethers } = hre

describe("SentinelTEMPO", function () {
  let contract: Awaited<ReturnType<typeof deploy>>["contract"]
  let token: Awaited<ReturnType<typeof deploy>>["token"]
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0]
  let treasury: Awaited<ReturnType<typeof ethers.getSigners>>[0]
  let user1: Awaited<ReturnType<typeof ethers.getSigners>>[0]
  let user2: Awaited<ReturnType<typeof ethers.getSigners>>[0]
  let minter: Awaited<ReturnType<typeof ethers.getSigners>>[0]

  const WL_PRICE = 5_000_000n
  const PUBLIC_PRICE = 8_000_000n
  const MAX_PER_WALLET = 3n
  const ZERO_ROOT = ethers.ZeroHash

  async function deploy() {
    const [_owner, _treasury, _user1, _user2, _minter] = await ethers.getSigners()

    const MockPathUSD = await ethers.getContractFactory("MockPathUSD")
    const _token = await MockPathUSD.deploy()

    // Build a simple Merkle tree for user1 only
    const leaf = ethers.keccak256(ethers.solidityPacked(["address"], [_user1.address]))
    const root = leaf // single-leaf tree: root = leaf

    const SentinelTEMPO = await ethers.getContractFactory("SentinelTEMPO")
    const _contract = await SentinelTEMPO.deploy(
      await _token.getAddress(),
      _treasury.address,
      root
    )

    return { contract: _contract, token: _token, root, leaf }
  }

  beforeEach(async function () {
    [owner, treasury, user1, user2, minter] = await ethers.getSigners()
    const deployed = await deploy()
    contract = deployed.contract
    token = deployed.token
  })

  // ─── Phase Management ───

  describe("Phase Management", function () {
    it("starts in CLOSED phase", async function () {
      expect(await contract.mintPhase()).to.equal(0) // CLOSED
    })

    it("owner can change phase", async function () {
      await expect(contract.setMintPhase(1))
        .to.emit(contract, "PhaseChanged")
        .withArgs(1)
      expect(await contract.mintPhase()).to.equal(1)
    })

    it("non-owner cannot change phase", async function () {
      await expect(contract.connect(user1).setMintPhase(2))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
    })
  })

  // ─── Whitelist Mint ───

  describe("Whitelist Mint", function () {
    beforeEach(async function () {
      await contract.setMintPhase(1) // WHITELIST
      // Give user1 tokens and approve
      await token.mint(user1.address, WL_PRICE * 2n)
      await token.connect(user1).approve(await contract.getAddress(), WL_PRICE * 2n)
    })

    it("whitelisted user can mint", async function () {
      // Single-leaf tree: proof is empty
      await contract.connect(user1).mintWhitelist([], "ipfs://test-uri")
      expect(await contract.totalSupply()).to.equal(1)
      expect(await contract.ownerOf(0)).to.equal(user1.address)
      expect(await contract.tokenURI(0)).to.equal("ipfs://test-uri")
    })

    it("whitelisted user cannot mint twice", async function () {
      await contract.connect(user1).mintWhitelist([], "ipfs://uri1")
      await expect(contract.connect(user1).mintWhitelist([], "ipfs://uri2"))
        .to.be.revertedWith("already minted WL")
    })

    it("non-whitelisted user cannot mint", async function () {
      await token.mint(user2.address, WL_PRICE)
      await token.connect(user2).approve(await contract.getAddress(), WL_PRICE)
      await expect(contract.connect(user2).mintWhitelist([], "ipfs://uri"))
        .to.be.revertedWith("not whitelisted")
    })

    it("cannot WL mint when phase is not WHITELIST", async function () {
      await contract.setMintPhase(2) // PUBLIC
      await expect(contract.connect(user1).mintWhitelist([], "ipfs://uri"))
        .to.be.revertedWith("WL mint not active")
    })

    it("payment is transferred to treasury", async function () {
      const before = await token.balanceOf(treasury.address)
      await contract.connect(user1).mintWhitelist([], "ipfs://uri")
      const after = await token.balanceOf(treasury.address)
      expect(after - before).to.equal(WL_PRICE)
    })
  })

  // ─── Public Mint ───

  describe("Public Mint", function () {
    beforeEach(async function () {
      await contract.setMintPhase(2) // PUBLIC
      await token.mint(user1.address, PUBLIC_PRICE * 10n)
      await token.connect(user1).approve(await contract.getAddress(), PUBLIC_PRICE * 10n)
    })

    it("anyone can public mint", async function () {
      await contract.connect(user1).mintPublic("ipfs://pub-uri")
      expect(await contract.totalSupply()).to.equal(1)
      expect(await contract.ownerOf(0)).to.equal(user1.address)
    })

    it("respects MAX_PER_WALLET limit", async function () {
      for (let i = 0; i < Number(MAX_PER_WALLET); i++) {
        await contract.connect(user1).mintPublic(`ipfs://uri-${i}`)
      }
      await expect(contract.connect(user1).mintPublic("ipfs://one-too-many"))
        .to.be.revertedWith("max per wallet reached")
    })

    it("different wallets have independent limits", async function () {
      await token.mint(user2.address, PUBLIC_PRICE * 3n)
      await token.connect(user2).approve(await contract.getAddress(), PUBLIC_PRICE * 3n)

      // user1 mints 3
      for (let i = 0; i < 3; i++) {
        await contract.connect(user1).mintPublic(`ipfs://u1-${i}`)
      }
      // user2 can still mint
      await contract.connect(user2).mintPublic("ipfs://u2-0")
      expect(await contract.totalSupply()).to.equal(4)
    })

    it("cannot public mint when phase is not PUBLIC", async function () {
      await contract.setMintPhase(0) // CLOSED
      await expect(contract.connect(user1).mintPublic("ipfs://uri"))
        .to.be.revertedWith("public mint not active")
    })

    it("payment is transferred to treasury", async function () {
      const before = await token.balanceOf(treasury.address)
      await contract.connect(user1).mintPublic("ipfs://uri")
      const after = await token.balanceOf(treasury.address)
      expect(after - before).to.equal(PUBLIC_PRICE)
    })

    it("fails without sufficient allowance", async function () {
      await token.mint(user2.address, PUBLIC_PRICE)
      // No approve
      await expect(contract.connect(user2).mintPublic("ipfs://uri"))
        .to.be.reverted
    })
  })

  // ─── mintTo (Authorized Minter) ───

  describe("mintTo", function () {
    beforeEach(async function () {
      await contract.setMintPhase(2) // PUBLIC
      await contract.setMinter(minter.address, true)
    })

    it("authorized minter can mint to any address", async function () {
      await contract.connect(minter).mintTo(user1.address, "ipfs://agent-uri")
      expect(await contract.ownerOf(0)).to.equal(user1.address)
      expect(await contract.tokenURI(0)).to.equal("ipfs://agent-uri")
    })

    it("unauthorized address cannot use mintTo", async function () {
      await expect(contract.connect(user1).mintTo(user2.address, "ipfs://uri"))
        .to.be.revertedWith("not authorized minter")
    })

    it("mintTo does not require payment (by design)", async function () {
      // Minter has no tokens — should still work
      await contract.connect(minter).mintTo(user1.address, "ipfs://free")
      expect(await contract.totalSupply()).to.equal(1)
    })

    it("mintTo fails when phase is CLOSED", async function () {
      await contract.setMintPhase(0) // CLOSED
      await expect(contract.connect(minter).mintTo(user1.address, "ipfs://uri"))
        .to.be.revertedWith("minting closed")
    })

    it("mintTo does not count toward MAX_PER_WALLET", async function () {
      // Mint 5 tokens to user1 via mintTo — should not trigger per-wallet limit
      for (let i = 0; i < 5; i++) {
        await contract.connect(minter).mintTo(user1.address, `ipfs://mt-${i}`)
      }
      expect(await contract.totalSupply()).to.equal(5)
    })
  })

  // ─── Admin Functions & Events ───

  describe("Admin Functions", function () {
    it("setMerkleRoot emits event", async function () {
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new-root"))
      await expect(contract.setMerkleRoot(newRoot))
        .to.emit(contract, "MerkleRootUpdated")
        .withArgs(newRoot)
    })

    it("setMinter emits event", async function () {
      await expect(contract.setMinter(minter.address, true))
        .to.emit(contract, "MinterUpdated")
        .withArgs(minter.address, true)
    })

    it("setTreasury emits event", async function () {
      await expect(contract.setTreasury(user2.address))
        .to.emit(contract, "TreasuryUpdated")
        .withArgs(user2.address)
    })

    it("non-owner cannot set merkle root", async function () {
      await expect(contract.connect(user1).setMerkleRoot(ethers.ZeroHash))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
    })

    it("non-owner cannot set minter", async function () {
      await expect(contract.connect(user1).setMinter(user1.address, true))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
    })

    it("non-owner cannot set treasury", async function () {
      await expect(contract.connect(user1).setTreasury(user1.address))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
    })

    it("minter can be revoked", async function () {
      await contract.setMinter(minter.address, true)
      await contract.setMintPhase(2)
      await contract.connect(minter).mintTo(user1.address, "ipfs://ok")
      
      await contract.setMinter(minter.address, false)
      await expect(contract.connect(minter).mintTo(user1.address, "ipfs://fail"))
        .to.be.revertedWith("not authorized minter")
    })
  })

  // ─── tokenURI ───

  describe("tokenURI", function () {
    it("returns URI for minted token", async function () {
      await contract.setMintPhase(2)
      await contract.setMinter(minter.address, true)
      await contract.connect(minter).mintTo(user1.address, "ipfs://my-nft")
      expect(await contract.tokenURI(0)).to.equal("ipfs://my-nft")
    })

    it("reverts for non-existent token", async function () {
      await expect(contract.tokenURI(99999))
        .to.be.revertedWithCustomError(contract, "ERC721NonexistentToken")
    })
  })

  // ─── Supply Cap ───

  describe("Supply Cap", function () {
    it("MAX_SUPPLY is 10000", async function () {
      expect(await contract.MAX_SUPPLY()).to.equal(10_000)
    })

    it("totalSupply increments correctly", async function () {
      await contract.setMintPhase(2)
      await contract.setMinter(minter.address, true)
      
      expect(await contract.totalSupply()).to.equal(0)
      await contract.connect(minter).mintTo(user1.address, "ipfs://1")
      expect(await contract.totalSupply()).to.equal(1)
      await contract.connect(minter).mintTo(user1.address, "ipfs://2")
      expect(await contract.totalSupply()).to.equal(2)
    })
  })

  // ─── Token ID sequencing ───

  describe("Token IDs", function () {
    it("token IDs are sequential starting from 0", async function () {
      await contract.setMintPhase(2)
      await contract.setMinter(minter.address, true)

      await contract.connect(minter).mintTo(user1.address, "ipfs://a")
      await contract.connect(minter).mintTo(user2.address, "ipfs://b")
      await contract.connect(minter).mintTo(user1.address, "ipfs://c")

      expect(await contract.ownerOf(0)).to.equal(user1.address)
      expect(await contract.ownerOf(1)).to.equal(user2.address)
      expect(await contract.ownerOf(2)).to.equal(user1.address)
    })
  })
})
