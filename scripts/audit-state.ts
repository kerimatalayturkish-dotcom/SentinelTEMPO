import { createPublicClient, http, formatUnits } from 'viem';
import { tempoChain } from '../lib/chain';
import { SENTINEL_ABI as BASE_ABI, PATHUSD_ABI } from '../lib/contract';

const SENTINEL_ABI = [
  ...BASE_ABI,
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'treasury', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'merkleRoot', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'minters', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'wlMinted', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'agentMintCount', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'humanMintCount', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'mintStartTime', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'wlEndTime', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'agentEndTime', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'MAX_SUPPLY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const client = createPublicClient({ chain: tempoChain, transport: http() });
const C = '0xb7A1e88741c88371ce5a2AC7CeEDDe3F7D68A685' as const;
const PATHUSD = '0x20c0000000000000000000000000000000000000' as const;
const AGENT = '0x82Ad2fbA237c33D07Bf38ED190E8b14771c60De3' as const;
const FEE = '0x546DEd146813cb5dC7E7F8590f8729518017b05D' as const;
const DEPLOYER = '0x0Be3b0A137EDb64F5Ce91D4f8722F7BfeFe26b87' as const;
const TREASURY = '0x27d231B931476E799e7DD9977511239490693150' as const;

async function main() {
  const [phase, supply, max, mintStart, wlEnd, agentEnd, paused, owner, treasuryOnChain, root, isMinterDeployer, isMinterFee, isMinterAgent] = await Promise.all([
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'currentPhase' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'totalSupply' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'MAX_SUPPLY' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'mintStartTime' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'wlEndTime' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'agentEndTime' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'paused' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'owner' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'treasury' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'merkleRoot' }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'minters', args: [DEPLOYER] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'minters', args: [FEE] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'minters', args: [AGENT] }),
  ]);

  const now = Math.floor(Date.now() / 1000);
  console.log('=== CONTRACT STATE ===');
  const phaseNames = ['CLOSED', 'WHITELIST', 'WL_AGENT_INTERVAL', 'AGENT_PUBLIC', 'AGENT_HUMAN_INTERVAL', 'HUMAN_PUBLIC'];
  console.log('phase:', phase, phaseNames[Number(phase)]);
  console.log('supply:', supply, '/', max);
  console.log('paused:', paused);
  console.log('owner == deployer?', owner.toLowerCase() === DEPLOYER.toLowerCase(), '(', owner, ')');
  console.log('treasury matches expected?', treasuryOnChain.toLowerCase() === TREASURY.toLowerCase(), '(', treasuryOnChain, ')');
  console.log('merkleRoot:', root);
  console.log('mintStart:', mintStart, '(', new Date(Number(mintStart) * 1000).toISOString(), ',', ((now - Number(mintStart)) / 3600).toFixed(2), 'h ago)');
  console.log('wlEnd:', wlEnd, wlEnd > 0n ? new Date(Number(wlEnd) * 1000).toISOString() : '(not yet recorded)');
  console.log('agentEnd:', agentEnd, agentEnd > 0n ? new Date(Number(agentEnd) * 1000).toISOString() : '(not yet recorded)');
  console.log();
  console.log('=== AUTHORISED MINTERS ===');
  console.log('deployer is minter?', isMinterDeployer);
  console.log('fee-payer is minter?', isMinterFee, '(should be FALSE)');
  console.log('agent wallet is minter?', isMinterAgent, '(should be FALSE)');
  console.log();

  const [wlAgent, agentAgent, humanAgent, wlDep, agentDep, humanDep] = await Promise.all([
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'wlMinted', args: [AGENT] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'agentMintCount', args: [AGENT] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'humanMintCount', args: [AGENT] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'wlMinted', args: [DEPLOYER] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'agentMintCount', args: [DEPLOYER] }),
    client.readContract({ address: C, abi: SENTINEL_ABI, functionName: 'humanMintCount', args: [DEPLOYER] }),
  ]);
  console.log('=== AGENT WALLET COUNTERS (', AGENT, ') ===');
  console.log('wlMinted        :', wlAgent, '(cap 1)');
  console.log('agentMintCount  :', agentAgent, '(cap 5)');
  console.log('humanMintCount  :', humanAgent, '(cap 5)');
  console.log();
  console.log('=== DEPLOYER COUNTERS ===');
  console.log('wlMinted        :', wlDep);
  console.log('agentMintCount  :', agentDep);
  console.log('humanMintCount  :', humanDep);
  console.log();

  const [balDeployer, balFee, balAgent, balTreasury] = await Promise.all([
    client.readContract({ address: PATHUSD, abi: PATHUSD_ABI, functionName: 'balanceOf', args: [DEPLOYER] }),
    client.readContract({ address: PATHUSD, abi: PATHUSD_ABI, functionName: 'balanceOf', args: [FEE] }),
    client.readContract({ address: PATHUSD, abi: PATHUSD_ABI, functionName: 'balanceOf', args: [AGENT] }),
    client.readContract({ address: PATHUSD, abi: PATHUSD_ABI, functionName: 'balanceOf', args: [TREASURY] }),
  ]);
  console.log('=== pathUSD BALANCES ===');
  console.log('deployer/server :', formatUnits(balDeployer, 6));
  console.log('fee-payer       :', formatUnits(balFee, 6));
  console.log('agent           :', formatUnits(balAgent, 6));
  console.log('treasury        :', formatUnits(balTreasury, 6));
}

main().catch((e) => { console.error(e); process.exit(1); });
