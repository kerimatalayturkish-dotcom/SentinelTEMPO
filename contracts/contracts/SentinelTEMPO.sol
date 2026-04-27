// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface ITIP20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title SentinelTEMPO
/// @notice ERC-721 with autonomous phase timeline (WL â†’ interval â†’ agent â†’ interval â†’ public),
///         Merkle-gated whitelist, on-chain trait-hash uniqueness, and an authorised agent minter.
contract SentinelTEMPO is ERC721, Ownable, ReentrancyGuard {
    // â”€â”€â”€ Constants â”€â”€â”€
    uint256 public constant WL_MAX_PER_WALLET     = 1;
    uint256 public constant PUBLIC_MAX_PER_WALLET = 5;
    uint256 public constant MAX_URI_LENGTH        = 200;
    uint256 public constant MAX_PAUSES            = 5;

    // â”€â”€â”€ Immutable config (constructor) â”€â”€â”€
    address public immutable paymentToken;
    address public immutable treasury;
    uint256 public immutable MAX_SUPPLY;
    uint256 public immutable WL_CAP;
    uint256 public immutable AGENT_CAP;
    uint256 public immutable WL_DURATION;
    uint256 public immutable AGENT_DURATION;
    uint256 public immutable INTERVAL;
    uint256 public immutable WL_PRICE;
    uint256 public immutable HUMAN_PRICE;

    // â”€â”€â”€ Mutable config â”€â”€â”€
    bytes32 public merkleRoot;

    // â”€â”€â”€ Supply â”€â”€â”€
    uint256 public totalSupply;
    uint256 public wlSupply;
    uint256 public agentSupply;

    // â”€â”€â”€ Phase Timeline â”€â”€â”€
    uint256 public mintStartTime;        // 0 = not started
    uint256 public wlEndTime;            // Recorded when WL ends (cap or duration)
    uint256 public agentEndTime;         // Recorded when agent phase ends

    // â”€â”€â”€ Pause â”€â”€â”€
    bool    public paused;
    uint256 public pausedAt;
    uint256 public totalPausedDuration;
    uint256 public pauseCount;

    // â”€â”€â”€ Per-token / per-wallet â”€â”€â”€
    mapping(uint256 => string)  private _tokenURIs;
    mapping(uint256 => bytes32) public  tokenTraitHash;     // tokenId â†’ traitHash
    mapping(bytes32 => uint256) public  usedTraitHash;      // traitHash â†’ tokenId+1 (0 = unused)
    mapping(address => bool)    public  minters;
    mapping(address => bool)    public  wlMinted;
    mapping(address => uint256) public  agentMintCount;
    mapping(address => uint256) public  humanMintCount;

    // â”€â”€â”€ Phases â”€â”€â”€
    enum Phase { CLOSED, WHITELIST, WL_AGENT_INTERVAL, AGENT_PUBLIC, AGENT_HUMAN_INTERVAL, HUMAN_PUBLIC }

    // â”€â”€â”€ Events â”€â”€â”€
    event MintStarted(uint256 startTime);
    event PhaseAdvanced(Phase indexed phase);
    event Paused(uint256 pauseCount);
    event Unpaused(uint256 addedDuration);
    event MerkleRootUpdated(bytes32 root);
    event MinterUpdated(address indexed minter, bool allowed);
    event AgentMint(address indexed to, uint256 indexed tokenId, bytes32 indexed traitHash);
    event TraitHashUsed(bytes32 indexed traitHash, uint256 indexed tokenId);

    struct Config {
        address paymentToken;
        address treasury;
        bytes32 merkleRoot;
        uint256 maxSupply;
        uint256 wlCap;
        uint256 agentCap;
        uint256 wlDuration;
        uint256 agentDuration;
        uint256 interval;
        uint256 wlPrice;
        uint256 humanPrice;
    }

    constructor(Config memory cfg)
        ERC721("SentinelTEMPO", "SNTL")
        Ownable(msg.sender)
    {
        require(cfg.paymentToken != address(0), "paymentToken=0");
        require(cfg.treasury != address(0), "treasury=0");
        require(cfg.maxSupply > 0, "maxSupply=0");
        require(cfg.wlCap <= cfg.maxSupply, "wlCap>max");
        require(cfg.agentCap <= cfg.maxSupply, "agentCap>max");
        require(cfg.wlCap + cfg.agentCap <= cfg.maxSupply, "wl+agent>max");
        require(cfg.wlDuration > 0 && cfg.agentDuration > 0 && cfg.interval > 0, "duration=0");

        paymentToken   = cfg.paymentToken;
        treasury       = cfg.treasury;
        merkleRoot     = cfg.merkleRoot;
        MAX_SUPPLY     = cfg.maxSupply;
        WL_CAP         = cfg.wlCap;
        AGENT_CAP      = cfg.agentCap;
        WL_DURATION    = cfg.wlDuration;
        AGENT_DURATION = cfg.agentDuration;
        INTERVAL       = cfg.interval;
        WL_PRICE       = cfg.wlPrice;
        HUMAN_PRICE    = cfg.humanPrice;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Phase Computation (fully on-chain)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function currentPhase() public view returns (Phase) {
        if (paused || mintStartTime == 0) return Phase.CLOSED;

        uint256 adjusted = block.timestamp - totalPausedDuration;

        // â”€â”€ WL Phase â”€â”€
        uint256 wlDeadline = mintStartTime + WL_DURATION;
        if (wlEndTime == 0) {
            if (adjusted < wlDeadline && wlSupply < WL_CAP) {
                return Phase.WHITELIST;
            }
        }

        uint256 effectiveWlEnd = wlEndTime > 0
            ? wlEndTime
            : (wlSupply >= WL_CAP ? adjusted : wlDeadline);

        // â”€â”€ First Interval â”€â”€
        uint256 agentStart = effectiveWlEnd + INTERVAL;
        if (adjusted < agentStart) return Phase.WL_AGENT_INTERVAL;

        // â”€â”€ Agent Public Phase â”€â”€
        uint256 agentDeadline = agentStart + AGENT_DURATION;
        if (agentEndTime == 0) {
            if (adjusted < agentDeadline && agentSupply < AGENT_CAP) {
                return Phase.AGENT_PUBLIC;
            }
        }

        uint256 effectiveAgentEnd = agentEndTime > 0
            ? agentEndTime
            : (agentSupply >= AGENT_CAP ? adjusted : agentDeadline);

        // â”€â”€ Second Interval â”€â”€
        uint256 humanStart = effectiveAgentEnd + INTERVAL;
        if (adjusted < humanStart) return Phase.AGENT_HUMAN_INTERVAL;

        return Phase.HUMAN_PUBLIC;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Phase Info (for frontend / agents)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function phaseInfo() external view returns (
        Phase phase,
        uint256 phaseEndsAt,
        uint256 phaseRemaining,
        uint256 _totalSupply,
        uint256 _wlSupply,
        uint256 _agentSupply
    ) {
        phase = currentPhase();
        _totalSupply = totalSupply;
        _wlSupply = wlSupply;
        _agentSupply = agentSupply;

        if (phase == Phase.WHITELIST) {
            phaseEndsAt = mintStartTime + WL_DURATION + totalPausedDuration;
            phaseRemaining = WL_CAP - wlSupply;
        } else if (phase == Phase.AGENT_PUBLIC) {
            uint256 effectiveWlEnd = wlEndTime > 0 ? wlEndTime : mintStartTime + WL_DURATION;
            phaseEndsAt = effectiveWlEnd + INTERVAL + AGENT_DURATION + totalPausedDuration;
            phaseRemaining = AGENT_CAP - agentSupply;
        } else if (phase == Phase.HUMAN_PUBLIC) {
            phaseEndsAt = 0;
            phaseRemaining = MAX_SUPPLY - totalSupply;
        } else if (phase == Phase.WL_AGENT_INTERVAL) {
            uint256 effectiveWlEnd = wlEndTime > 0 ? wlEndTime : mintStartTime + WL_DURATION;
            phaseEndsAt = effectiveWlEnd + INTERVAL + totalPausedDuration;
            phaseRemaining = 0;
        } else if (phase == Phase.AGENT_HUMAN_INTERVAL) {
            uint256 effectiveWlEnd = wlEndTime > 0 ? wlEndTime : mintStartTime + WL_DURATION;
            uint256 effectiveAgentEnd = agentEndTime > 0 ? agentEndTime : effectiveWlEnd + INTERVAL + AGENT_DURATION;
            phaseEndsAt = effectiveAgentEnd + INTERVAL + totalPausedDuration;
            phaseRemaining = 0;
        } else {
            phaseEndsAt = mintStartTime > 0 ? mintStartTime + totalPausedDuration : 0;
            phaseRemaining = 0;
        }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Internal: Record phase transitions
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function _recordWlEnd() internal {
        if (wlEndTime == 0 && mintStartTime > 0) {
            uint256 adjusted = block.timestamp - totalPausedDuration;
            uint256 wlDeadline = mintStartTime + WL_DURATION;
            if (wlSupply >= WL_CAP || adjusted >= wlDeadline) {
                wlEndTime = adjusted < wlDeadline ? adjusted : wlDeadline;
                emit PhaseAdvanced(Phase.WL_AGENT_INTERVAL);
            }
        }
    }

    function _recordAgentEnd() internal {
        if (agentEndTime == 0 && wlEndTime > 0) {
            uint256 adjusted = block.timestamp - totalPausedDuration;
            uint256 agentStart = wlEndTime + INTERVAL;
            uint256 agentDeadline = agentStart + AGENT_DURATION;
            if (agentSupply >= AGENT_CAP || adjusted >= agentDeadline) {
                agentEndTime = adjusted < agentDeadline ? adjusted : agentDeadline;
                emit PhaseAdvanced(Phase.AGENT_HUMAN_INTERVAL);
            }
        }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Internal: shared bookkeeping (CEI-ordered)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function _registerTraitHash(bytes32 traitHash, uint256 tokenId) internal {
        require(traitHash != bytes32(0), "traitHash=0");
        require(usedTraitHash[traitHash] == 0, "trait combo taken");
        usedTraitHash[traitHash] = tokenId + 1; // +1 so 0 means unused
        tokenTraitHash[tokenId] = traitHash;
        emit TraitHashUsed(traitHash, tokenId);
    }

    function _setTokenURI(uint256 tokenId, string calldata uri) internal {
        require(bytes(uri).length > 0, "uri empty");
        require(bytes(uri).length <= MAX_URI_LENGTH, "uri too long");
        _tokenURIs[tokenId] = uri;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Human Whitelist Mint
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function mintWhitelist(
        bytes32[] calldata proof,
        string calldata uri,
        bytes32 traitHash
    ) external nonReentrant returns (uint256) {
        _recordWlEnd();
        require(currentPhase() == Phase.WHITELIST, "WL mint not active");
        require(totalSupply < MAX_SUPPLY, "sold out");
        require(!wlMinted[msg.sender], "already minted WL");

        // Double-hashed leaf for OpenZeppelin StandardMerkleTree compatibility.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "not whitelisted");

        // â”€â”€ Effects (state writes BEFORE external call) â”€â”€
        wlMinted[msg.sender] = true;
        wlSupply++;
        uint256 tokenId = totalSupply++;
        _registerTraitHash(traitHash, tokenId);
        _setTokenURI(tokenId, uri);
        _mint(msg.sender, tokenId);

        // â”€â”€ Interaction â”€â”€
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, WL_PRICE),
            "payment failed"
        );

        _recordWlEnd();
        return tokenId;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Human Public Mint
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function mintPublic(
        string calldata uri,
        bytes32 traitHash
    ) external nonReentrant returns (uint256) {
        _recordWlEnd();
        _recordAgentEnd();
        require(currentPhase() == Phase.HUMAN_PUBLIC, "human mint not active");
        require(totalSupply < MAX_SUPPLY, "sold out");
        require(humanMintCount[msg.sender] < PUBLIC_MAX_PER_WALLET, "max per wallet reached");

        // â”€â”€ Effects â”€â”€
        humanMintCount[msg.sender]++;
        uint256 tokenId = totalSupply++;
        _registerTraitHash(traitHash, tokenId);
        _setTokenURI(tokenId, uri);
        _mint(msg.sender, tokenId);

        // â”€â”€ Interaction â”€â”€
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, HUMAN_PRICE),
            "payment failed"
        );

        return tokenId;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Agent Mint (authorised minter / server)
    //  Payment is handled upstream via MPP.
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function mintForAgent(
        address to,
        bytes32[] calldata proof,
        string calldata uri,
        bytes32 traitHash
    ) external nonReentrant returns (uint256) {
        require(minters[msg.sender], "not authorized minter");
        require(to != address(0), "to=0");

        _recordWlEnd();
        _recordAgentEnd();
        require(totalSupply < MAX_SUPPLY, "sold out");

        Phase phase = currentPhase();

        if (phase == Phase.WHITELIST) {
            require(!wlMinted[to], "already minted WL");
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(to))));
            require(MerkleProof.verify(proof, merkleRoot, leaf), "not whitelisted");
            wlMinted[to] = true;
            wlSupply++;
        } else if (phase == Phase.AGENT_PUBLIC) {
            require(agentMintCount[to] < PUBLIC_MAX_PER_WALLET, "max per wallet reached");
            agentSupply++;
            agentMintCount[to]++;
        } else {
            revert("agent mint not active");
        }

        // â”€â”€ Effects â”€â”€
        uint256 tokenId = totalSupply++;
        _registerTraitHash(traitHash, tokenId);
        _setTokenURI(tokenId, uri);
        _mint(to, tokenId);

        if (phase == Phase.WHITELIST) {
            _recordWlEnd();
        } else {
            _recordAgentEnd();
        }

        emit AgentMint(to, tokenId, traitHash);
        return tokenId;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Owner Controls
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function startMint() external onlyOwner {
        require(mintStartTime == 0, "already started");
        require(merkleRoot != bytes32(0), "merkleRoot=0");
        mintStartTime = block.timestamp;
        emit MintStarted(block.timestamp);
        emit PhaseAdvanced(Phase.WHITELIST);
    }

    function emergencyPause() external onlyOwner {
        require(!paused, "already paused");
        require(mintStartTime > 0, "mint not started");
        require(pauseCount < MAX_PAUSES, "max pauses reached");
        paused = true;
        pausedAt = block.timestamp;
        pauseCount++;
        emit Paused(pauseCount);
    }

    function unpause() external onlyOwner {
        require(paused, "not paused");
        uint256 pauseDuration = block.timestamp - pausedAt;
        totalPausedDuration += pauseDuration;
        paused = false;
        pausedAt = 0;
        emit Unpaused(pauseDuration);
    }

    /// @notice Update the WL merkle root. Locked once `startMint()` has been called.
    function setMerkleRoot(bytes32 root) external onlyOwner {
        require(mintStartTime == 0, "mint already started");
        merkleRoot = root;
        emit MerkleRootUpdated(root);
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        require(minter != address(0), "minter=0");
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  View Helpers
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function wlRemaining() external view returns (uint256) {
        return wlSupply >= WL_CAP ? 0 : WL_CAP - wlSupply;
    }

    function agentRemaining() external view returns (uint256) {
        return agentSupply >= AGENT_CAP ? 0 : AGENT_CAP - agentSupply;
    }

    function isTraitHashUsed(bytes32 traitHash) external view returns (bool) {
        return usedTraitHash[traitHash] != 0;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }
}
