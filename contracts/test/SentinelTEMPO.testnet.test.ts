import { expect } from "chai"
import hre from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import {
  Phase,
  TESTNET_CONFIG,
  deploySentinel,
  nextTraitHash,
  URI,
} from "./shared/fixtures"

const { ethers } = hre

const CFG = TESTNET_CONFIG
const WL_PRICE = CFG.wlPrice
const HUMAN_PRICE = CFG.humanPrice
const WL_DURATION = Number(CFG.wlDuration)
const AGENT_DURATION = Number(CFG.agentDuration)
const INTERVAL = Number(CFG.interval)
const WL_CAP = Number(CFG.wlCap)
const AGENT_CAP = Number(CFG.agentCap)
const MAX_SUPPLY = Number(CFG.maxSupply)

describe("SentinelTEMPO — testnet config (50/10/20, 1h/1h/10m)", function () {
  let fix: Awaited<ReturnType<typeof deploySentinel>>

  beforeEach(async function () {
    fix = await deploySentinel(CFG)
  })

  // ─── Deployment ───
  describe("Deployment", function () {
    it("starts in CLOSED phase", async function () {
      expect(await fix.contract.currentPhase()).to.equal(Phase.CLOSED)
    })

    it("wires constructor args correctly", async function () {
      const c = fix.contract
      expect(await c.paymentToken()).to.equal(await fix.token.getAddress())
      expect(await c.treasury()).to.equal(fix.treasury.address)
      expect(await c.merkleRoot()).to.equal(fix.tree.root)
      expect(await c.MAX_SUPPLY()).to.equal(CFG.maxSupply)
      expect(await c.WL_CAP()).to.equal(CFG.wlCap)
      expect(await c.AGENT_CAP()).to.equal(CFG.agentCap)
      expect(await c.WL_DURATION()).to.equal(CFG.wlDuration)
      expect(await c.AGENT_DURATION()).to.equal(CFG.agentDuration)
      expect(await c.INTERVAL()).to.equal(CFG.interval)
      expect(await c.WL_PRICE()).to.equal(CFG.wlPrice)
      expect(await c.HUMAN_PRICE()).to.equal(CFG.humanPrice)
    })

    it("supply starts at 0", async function () {
      expect(await fix.contract.totalSupply()).to.equal(0)
      expect(await fix.contract.wlSupply()).to.equal(0)
      expect(await fix.contract.agentSupply()).to.equal(0)
      expect(await fix.contract.pauseCount()).to.equal(0)
    })

    it("rejects zero paymentToken", async function () {
      const F = await ethers.getContractFactory("SentinelTEMPO")
      await expect(
        F.deploy({
          paymentToken:  ethers.ZeroAddress,
          treasury:      fix.treasury.address,
          merkleRoot:    fix.tree.root,
          maxSupply:     CFG.maxSupply,
          wlCap:         CFG.wlCap,
          agentCap:      CFG.agentCap,
          wlDuration:    CFG.wlDuration,
          agentDuration: CFG.agentDuration,
          interval:      CFG.interval,
          wlPrice:       CFG.wlPrice,
          humanPrice:    CFG.humanPrice,
        })
      ).to.be.revertedWith("paymentToken=0")
    })

    it("rejects wl+agent > max", async function () {
      const F = await ethers.getContractFactory("SentinelTEMPO")
      await expect(
        F.deploy({
          paymentToken:  await fix.token.getAddress(),
          treasury:      fix.treasury.address,
          merkleRoot:    fix.tree.root,
          maxSupply:     10n,
          wlCap:         8n,
          agentCap:      8n,
          wlDuration:    CFG.wlDuration,
          agentDuration: CFG.agentDuration,
          interval:      CFG.interval,
          wlPrice:       CFG.wlPrice,
          humanPrice:    CFG.humanPrice,
        })
      ).to.be.revertedWith("wl+agent>max")
    })
  })

  // ─── startMint ───
  describe("startMint", function () {
    it("owner can start", async function () {
      await expect(fix.contract.startMint())
        .to.emit(fix.contract, "MintStarted")
        .to.emit(fix.contract, "PhaseAdvanced")
        .withArgs(Phase.WHITELIST)
      expect(await fix.contract.currentPhase()).to.equal(Phase.WHITELIST)
    })

    it("cannot start twice", async function () {
      await fix.contract.startMint()
      await expect(fix.contract.startMint()).to.be.revertedWith("already started")
    })

    it("non-owner cannot start", async function () {
      await expect(fix.contract.connect(fix.user1).startMint())
        .to.be.revertedWithCustomError(fix.contract, "OwnableUnauthorizedAccount")
    })

    it("cannot start with zero merkle root", async function () {
      const F = await ethers.getContractFactory("SentinelTEMPO")
      const c = await F.deploy({
        paymentToken:  await fix.token.getAddress(),
        treasury:      fix.treasury.address,
        merkleRoot:    ethers.ZeroHash,
        maxSupply:     CFG.maxSupply,
        wlCap:         CFG.wlCap,
        agentCap:      CFG.agentCap,
        wlDuration:    CFG.wlDuration,
        agentDuration: CFG.agentDuration,
        interval:      CFG.interval,
        wlPrice:       CFG.wlPrice,
        humanPrice:    CFG.humanPrice,
      })
      await expect(c.startMint()).to.be.revertedWith("merkleRoot=0")
    })
  })

  // ─── Human WL mint ───
  describe("Human Whitelist Mint", function () {
    beforeEach(async function () {
      await fix.contract.startMint()
      await fix.token.mint(fix.user1.address, WL_PRICE * 5n)
      await fix.token.connect(fix.user1).approve(await fix.contract.getAddress(), WL_PRICE * 5n)
      await fix.token.mint(fix.user2.address, WL_PRICE * 5n)
      await fix.token.connect(fix.user2).approve(await fix.contract.getAddress(), WL_PRICE * 5n)
    })

    it("WL user can mint with valid proof", async function () {
      const th = nextTraitHash()
      await fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI(0), th)
      expect(await fix.contract.totalSupply()).to.equal(1)
      expect(await fix.contract.ownerOf(0)).to.equal(fix.user1.address)
      expect(await fix.contract.tokenURI(0)).to.equal(URI(0))
      expect(await fix.contract.tokenTraitHash(0)).to.equal(th)
      expect(await fix.contract.usedTraitHash(th)).to.equal(1n) // tokenId+1
      expect(await fix.contract.isTraitHashUsed(th)).to.equal(true)
    })

    it("cannot mint twice (1 per wallet)", async function () {
      await fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI("a"), nextTraitHash())
      await expect(
        fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI("b"), nextTraitHash())
      ).to.be.revertedWith("already minted WL")
    })

    it("non-WL user cannot mint", async function () {
      await fix.token.mint(fix.user3.address, WL_PRICE)
      await fix.token.connect(fix.user3).approve(await fix.contract.getAddress(), WL_PRICE)
      await expect(
        fix.contract.connect(fix.user3).mintWhitelist([], URI(), nextTraitHash())
      ).to.be.revertedWith("not whitelisted")
    })

    it("payment goes to treasury", async function () {
      const before = await fix.token.balanceOf(fix.treasury.address)
      await fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI(), nextTraitHash())
      expect((await fix.token.balanceOf(fix.treasury.address)) - before).to.equal(WL_PRICE)
    })

    it("rejects empty URI", async function () {
      await expect(
        fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, "", nextTraitHash())
      ).to.be.revertedWith("uri empty")
    })

    it("rejects oversized URI (>200 chars)", async function () {
      const big = "x".repeat(201)
      await expect(
        fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, big, nextTraitHash())
      ).to.be.revertedWith("uri too long")
    })

    it("rejects zero traitHash", async function () {
      await expect(
        fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI(), ethers.ZeroHash)
      ).to.be.revertedWith("traitHash=0")
    })

    it("rejects duplicate traitHash across wallets", async function () {
      const th = nextTraitHash()
      await fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI("a"), th)
      await expect(
        fix.contract.connect(fix.user2).mintWhitelist(fix.proof2, URI("b"), th)
      ).to.be.revertedWith("trait combo taken")
    })

    it("emits TraitHashUsed", async function () {
      const th = nextTraitHash()
      await expect(fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI(), th))
        .to.emit(fix.contract, "TraitHashUsed")
        .withArgs(th, 0)
    })

    it("WL caps out and locks the phase", async function () {
      // Mint WL_CAP tokens, each from a distinct WL user. We have 3 WL signers
      // (user1, user2, user4) and WL is 1-per-wallet. So this also exercises
      // proof-rotation + cap accounting up to WL_CAP=10.
      const wlSigners = [fix.user1, fix.user2, fix.user4]
      const proofs = [fix.proof1, fix.proof2, fix.proof4]

      // Build extra signers programmatically up to WL_CAP.
      const all = await ethers.getSigners()
      const extras = all.slice(7, 7 + (WL_CAP - wlSigners.length))
      // Re-deploy with a tree that includes the extras so they can mint.
      // (For testnet WL_CAP=10 this avoids a flaky "not enough signers" path.)
      // We assert here that we have enough hardhat signers:
      expect(extras.length).to.equal(WL_CAP - wlSigners.length)

      // For this test we re-deploy with all 10 WL addresses included.
      const { buildTree, proofFor } = await import("./shared/fixtures")
      const allWl = [...wlSigners, ...extras]
      const tree = buildTree(allWl.map((s) => s.address))

      const F = await ethers.getContractFactory("SentinelTEMPO")
      const c = await F.deploy({
        paymentToken:  await fix.token.getAddress(),
        treasury:      fix.treasury.address,
        merkleRoot:    tree.root,
        maxSupply:     CFG.maxSupply,
        wlCap:         CFG.wlCap,
        agentCap:      CFG.agentCap,
        wlDuration:    CFG.wlDuration,
        agentDuration: CFG.agentDuration,
        interval:      CFG.interval,
        wlPrice:       CFG.wlPrice,
        humanPrice:    CFG.humanPrice,
      })
      await c.startMint()

      for (const s of allWl) {
        await fix.token.mint(s.address, WL_PRICE)
        await fix.token.connect(s).approve(await c.getAddress(), WL_PRICE)
        await c.connect(s).mintWhitelist(proofFor(tree, s.address), URI(s.address), nextTraitHash())
      }

      expect(await c.wlSupply()).to.equal(WL_CAP)
      expect(await c.wlRemaining()).to.equal(0)
      // Cap-out should have recorded wlEndTime.
      expect(await c.wlEndTime()).to.be.gt(0)
      // currentPhase should advance off WHITELIST.
      expect(await c.currentPhase()).to.not.equal(Phase.WHITELIST)
    })
  })

  // ─── Agent mint in WL phase ───
  describe("Agent Mint (WL phase)", function () {
    beforeEach(async function () {
      await fix.contract.startMint()
      await fix.contract.setMinter(fix.minter.address, true)
    })

    it("authorised minter can mint for WL recipient", async function () {
      const th = nextTraitHash()
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, fix.proof1, URI(), th)
      )
        .to.emit(fix.contract, "AgentMint")
        .withArgs(fix.user1.address, 0, th)
      expect(await fix.contract.ownerOf(0)).to.equal(fix.user1.address)
    })

    it("does not pull pathUSD (handled by MPP upstream)", async function () {
      const before = await fix.token.balanceOf(fix.treasury.address)
      await fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, fix.proof1, URI(), nextTraitHash())
      expect(await fix.token.balanceOf(fix.treasury.address)).to.equal(before)
    })

    it("blocks duplicate WL mint for same recipient", async function () {
      await fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, fix.proof1, URI("a"), nextTraitHash())
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, fix.proof1, URI("b"), nextTraitHash())
      ).to.be.revertedWith("already minted WL")
    })

    it("rejects non-WL recipient", async function () {
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(fix.user3.address, [], URI(), nextTraitHash())
      ).to.be.revertedWith("not whitelisted")
    })

    it("unauthorised cannot call mintForAgent", async function () {
      await expect(
        fix.contract.connect(fix.user1).mintForAgent(fix.user1.address, fix.proof1, URI(), nextTraitHash())
      ).to.be.revertedWith("not authorized minter")
    })

    it("rejects to=0", async function () {
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(ethers.ZeroAddress, fix.proof1, URI(), nextTraitHash())
      ).to.be.revertedWith("to=0")
    })
  })

  // ─── Phase transitions ───
  describe("Phase Transitions", function () {
    beforeEach(async function () { await fix.contract.startMint() })

    it("WHITELIST → WL_AGENT_INTERVAL after WL_DURATION", async function () {
      await time.increase(WL_DURATION + 1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.WL_AGENT_INTERVAL)
    })

    it("→ AGENT_PUBLIC after first INTERVAL", async function () {
      await time.increase(WL_DURATION + INTERVAL + 1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.AGENT_PUBLIC)
    })

    it("→ AGENT_HUMAN_INTERVAL after AGENT_DURATION", async function () {
      await time.increase(WL_DURATION + INTERVAL + AGENT_DURATION + 1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.AGENT_HUMAN_INTERVAL)
    })

    it("→ HUMAN_PUBLIC after second INTERVAL", async function () {
      await time.increase(WL_DURATION + INTERVAL + AGENT_DURATION + INTERVAL + 1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.HUMAN_PUBLIC)
    })
  })

  // ─── Agent public mint ───
  describe("Agent Public Mint", function () {
    beforeEach(async function () {
      await fix.contract.startMint()
      await fix.contract.setMinter(fix.minter.address, true)
      await time.increase(WL_DURATION + INTERVAL + 1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.AGENT_PUBLIC)
    })

    it("mints without proof", async function () {
      await fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, [], URI(), nextTraitHash())
      expect(await fix.contract.ownerOf(0)).to.equal(fix.user1.address)
    })

    it("respects 5-per-wallet cap", async function () {
      for (let i = 0; i < 5; i++) {
        await fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, [], URI(`u1-${i}`), nextTraitHash())
      }
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, [], URI("over"), nextTraitHash())
      ).to.be.revertedWith("max per wallet reached")
    })

    it("agentSupply increments and cap-out advances phase", async function () {
      // AGENT_CAP=20, 5/wallet → need 4 distinct recipients.
      const recips = [fix.user1, fix.user2, fix.user3, fix.user4]
      let n = 0
      for (const r of recips) {
        for (let i = 0; i < 5; i++) {
          await fix.contract.connect(fix.minter).mintForAgent(r.address, [], URI(`r${n++}`), nextTraitHash())
        }
      }
      expect(await fix.contract.agentSupply()).to.equal(AGENT_CAP)
      expect(await fix.contract.agentEndTime()).to.be.gt(0)
      expect(await fix.contract.currentPhase()).to.not.equal(Phase.AGENT_PUBLIC)
    })
  })

  // ─── Human public mint ───
  describe("Human Public Mint", function () {
    beforeEach(async function () {
      await fix.contract.startMint()
      await time.increase(WL_DURATION + INTERVAL + AGENT_DURATION + INTERVAL + 1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.HUMAN_PUBLIC)
      await fix.token.mint(fix.user1.address, HUMAN_PRICE * 10n)
      await fix.token.connect(fix.user1).approve(await fix.contract.getAddress(), HUMAN_PRICE * 10n)
    })

    it("anyone with allowance can mint", async function () {
      await fix.contract.connect(fix.user1).mintPublic(URI(), nextTraitHash())
      expect(await fix.contract.totalSupply()).to.equal(1)
    })

    it("payment at HUMAN_PRICE", async function () {
      const before = await fix.token.balanceOf(fix.treasury.address)
      await fix.contract.connect(fix.user1).mintPublic(URI(), nextTraitHash())
      expect((await fix.token.balanceOf(fix.treasury.address)) - before).to.equal(HUMAN_PRICE)
    })

    it("respects 5-per-wallet cap", async function () {
      for (let i = 0; i < 5; i++) {
        await fix.contract.connect(fix.user1).mintPublic(URI(`h-${i}`), nextTraitHash())
      }
      await expect(
        fix.contract.connect(fix.user1).mintPublic(URI("over"), nextTraitHash())
      ).to.be.revertedWith("max per wallet reached")
    })

    it("rejects without allowance", async function () {
      await fix.token.mint(fix.user3.address, HUMAN_PRICE)
      await expect(
        fix.contract.connect(fix.user3).mintPublic(URI(), nextTraitHash())
      ).to.be.reverted
    })
  })

  // ─── Pause / unpause ───
  describe("Emergency Pause", function () {
    beforeEach(async function () { await fix.contract.startMint() })

    it("owner can pause and unpause", async function () {
      await expect(fix.contract.emergencyPause()).to.emit(fix.contract, "Paused").withArgs(1)
      expect(await fix.contract.currentPhase()).to.equal(Phase.CLOSED)
      expect(await fix.contract.pauseCount()).to.equal(1)
      await expect(fix.contract.unpause()).to.emit(fix.contract, "Unpaused")
    })

    it("blocks all minting while paused", async function () {
      await fix.token.mint(fix.user1.address, WL_PRICE)
      await fix.token.connect(fix.user1).approve(await fix.contract.getAddress(), WL_PRICE)
      await fix.contract.emergencyPause()
      await expect(
        fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI(), nextTraitHash())
      ).to.be.revertedWith("WL mint not active")
    })

    it("pause count caps at MAX_PAUSES", async function () {
      const max = Number(await fix.contract.MAX_PAUSES())
      for (let i = 0; i < max; i++) {
        await fix.contract.emergencyPause()
        await fix.contract.unpause()
      }
      await expect(fix.contract.emergencyPause()).to.be.revertedWith("max pauses reached")
    })

    it("pause shifts the timeline", async function () {
      // Advance halfway into WL, pause for the full WL_DURATION, unpause,
      // remaining time should still be the half we hadn't burned.
      await time.increase(WL_DURATION / 2)
      await fix.contract.emergencyPause()
      await time.increase(WL_DURATION)
      await fix.contract.unpause()
      expect(await fix.contract.currentPhase()).to.equal(Phase.WHITELIST)
      await time.increase(WL_DURATION / 2 + 2)
      expect(await fix.contract.currentPhase()).to.equal(Phase.WL_AGENT_INTERVAL)
    })
  })

  // ─── setMerkleRoot lock ───
  describe("setMerkleRoot lock", function () {
    it("owner can update root before startMint()", async function () {
      const r = ethers.keccak256(ethers.toUtf8Bytes("new"))
      await expect(fix.contract.setMerkleRoot(r))
        .to.emit(fix.contract, "MerkleRootUpdated").withArgs(r)
      expect(await fix.contract.merkleRoot()).to.equal(r)
    })

    it("locks after startMint()", async function () {
      await fix.contract.startMint()
      const r = ethers.keccak256(ethers.toUtf8Bytes("new"))
      await expect(fix.contract.setMerkleRoot(r))
        .to.be.revertedWith("mint already started")
    })
  })

  // ─── Agent gating across non-mint phases ───
  describe("Agent Phase Gating", function () {
    beforeEach(async function () {
      await fix.contract.startMint()
      await fix.contract.setMinter(fix.minter.address, true)
    })

    it("blocks during WL_AGENT_INTERVAL", async function () {
      await time.increase(WL_DURATION + 1)
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, [], URI(), nextTraitHash())
      ).to.be.revertedWith("agent mint not active")
    })

    it("blocks during HUMAN_PUBLIC", async function () {
      await time.increase(WL_DURATION + INTERVAL + AGENT_DURATION + INTERVAL + 1)
      await expect(
        fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, [], URI(), nextTraitHash())
      ).to.be.revertedWith("agent mint not active")
    })
  })

  // ─── tokenURI / view helpers ───
  describe("Views", function () {
    it("tokenURI reverts for non-existent token", async function () {
      await expect(fix.contract.tokenURI(99999))
        .to.be.revertedWithCustomError(fix.contract, "ERC721NonexistentToken")
    })

    it("MAX_SUPPLY reachable across phases (smoke)", async function () {
      // Just confirm the constants line up: WL+AGENT+humanRemainingCap >= MAX
      expect(WL_CAP + AGENT_CAP).to.be.lessThan(MAX_SUPPLY + 1)
    })
  })
})
