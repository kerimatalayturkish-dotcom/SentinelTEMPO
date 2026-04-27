import { expect } from "chai"
import hre from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import {
  Phase,
  MAINNET_CONFIG,
  deploySentinel,
  nextTraitHash,
  URI,
} from "./shared/fixtures"

const { ethers } = hre

const CFG = MAINNET_CONFIG
const WL_DURATION    = Number(CFG.wlDuration)
const AGENT_DURATION = Number(CFG.agentDuration)
const INTERVAL       = Number(CFG.interval)

/**
 * Mainnet config (10000 / 2000 / 3000 / 3h / 3h / 30m).
 * This is a *smoke* suite — we don't iterate to fill 2000/3000 caps
 * (that's covered by the per-wallet logic in the testnet suite).
 * The goal here is: prove the constants are wired through correctly,
 * the timeline boundaries hold, and a representative mint of each
 * type succeeds with the mainnet pricing.
 */
describe("SentinelTEMPO — mainnet config (10000/2000/3000, 3h/3h/30m)", function () {
  let fix: Awaited<ReturnType<typeof deploySentinel>>

  beforeEach(async function () {
    fix = await deploySentinel(CFG)
  })

  it("constants reflect mainnet config", async function () {
    const c = fix.contract
    expect(await c.MAX_SUPPLY()).to.equal(10_000n)
    expect(await c.WL_CAP()).to.equal(2_000n)
    expect(await c.AGENT_CAP()).to.equal(3_000n)
    expect(await c.WL_DURATION()).to.equal(3n * 3600n)
    expect(await c.AGENT_DURATION()).to.equal(3n * 3600n)
    expect(await c.INTERVAL()).to.equal(30n * 60n)
    expect(await c.WL_PRICE()).to.equal(2_000_000n)
    expect(await c.HUMAN_PRICE()).to.equal(4_000_000n)
  })

  it("WL human mint works at 2.00 pathUSD", async function () {
    await fix.contract.startMint()
    const price = await fix.contract.WL_PRICE()
    await fix.token.mint(fix.user1.address, price)
    await fix.token.connect(fix.user1).approve(await fix.contract.getAddress(), price)

    const before = await fix.token.balanceOf(fix.treasury.address)
    await fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI(), nextTraitHash())
    expect((await fix.token.balanceOf(fix.treasury.address)) - before).to.equal(price)
  })

  it("Agent WL mint works (no payment pulled)", async function () {
    await fix.contract.startMint()
    await fix.contract.setMinter(fix.minter.address, true)
    await fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, fix.proof1, URI(), nextTraitHash())
    expect(await fix.contract.ownerOf(0)).to.equal(fix.user1.address)
  })

  it("Agent public mint after first interval", async function () {
    await fix.contract.startMint()
    await fix.contract.setMinter(fix.minter.address, true)
    await time.increase(WL_DURATION + INTERVAL + 1)
    expect(await fix.contract.currentPhase()).to.equal(Phase.AGENT_PUBLIC)
    await fix.contract.connect(fix.minter).mintForAgent(fix.user1.address, [], URI(), nextTraitHash())
    expect(await fix.contract.ownerOf(0)).to.equal(fix.user1.address)
  })

  it("Human public mint at 4.00 pathUSD after full timeline", async function () {
    await fix.contract.startMint()
    await time.increase(WL_DURATION + INTERVAL + AGENT_DURATION + INTERVAL + 1)
    expect(await fix.contract.currentPhase()).to.equal(Phase.HUMAN_PUBLIC)

    const price = await fix.contract.HUMAN_PRICE()
    await fix.token.mint(fix.user1.address, price)
    await fix.token.connect(fix.user1).approve(await fix.contract.getAddress(), price)

    const before = await fix.token.balanceOf(fix.treasury.address)
    await fix.contract.connect(fix.user1).mintPublic(URI(), nextTraitHash())
    expect((await fix.token.balanceOf(fix.treasury.address)) - before).to.equal(price)
  })

  it("traitHash uniqueness still enforced under mainnet config", async function () {
    await fix.contract.startMint()
    const price = await fix.contract.WL_PRICE()
    await fix.token.mint(fix.user1.address, price)
    await fix.token.connect(fix.user1).approve(await fix.contract.getAddress(), price)
    await fix.token.mint(fix.user2.address, price)
    await fix.token.connect(fix.user2).approve(await fix.contract.getAddress(), price)

    const th = nextTraitHash()
    await fix.contract.connect(fix.user1).mintWhitelist(fix.proof1, URI("a"), th)
    await expect(
      fix.contract.connect(fix.user2).mintWhitelist(fix.proof2, URI("b"), th)
    ).to.be.revertedWith("trait combo taken")
  })
})
