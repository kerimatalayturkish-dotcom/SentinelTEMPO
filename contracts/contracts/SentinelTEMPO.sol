// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface ITIP20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SentinelTEMPO is ERC721, Ownable {
    uint256 public totalSupply;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant WL_PRICE = 5_000_000;      // 5 pathUSD (6 decimals)
    uint256 public constant PUBLIC_PRICE = 8_000_000;   // 8 pathUSD (6 decimals)
    uint256 public constant MAX_PER_WALLET = 3;

    address public immutable paymentToken;
    address public treasury;
    bytes32 public merkleRoot;

    enum Phase { CLOSED, WHITELIST, PUBLIC }
    Phase public mintPhase;

    mapping(uint256 => string) private _tokenURIs;
    mapping(address => bool) public minters;
    mapping(address => bool) public wlMinted;
    mapping(address => uint256) public mintCount;

    event PhaseChanged(Phase indexed phase);
    event MerkleRootUpdated(bytes32 root);
    event MinterUpdated(address indexed minter, bool allowed);
    event TreasuryUpdated(address indexed treasury);

    constructor(
        address _paymentToken,
        address _treasury,
        bytes32 _merkleRoot
    ) ERC721("SentinelTEMPO", "SNTL") Ownable(msg.sender) {
        paymentToken = _paymentToken;
        treasury = _treasury;
        merkleRoot = _merkleRoot;
    }

    function mintWhitelist(bytes32[] calldata proof, string calldata uri) external returns (uint256) {
        require(mintPhase == Phase.WHITELIST, "WL mint not active");
        require(totalSupply < MAX_SUPPLY, "sold out");
        require(!wlMinted[msg.sender], "already minted WL");
        require(
            MerkleProof.verify(proof, merkleRoot, keccak256(abi.encodePacked(msg.sender))),
            "not whitelisted"
        );
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, WL_PRICE),
            "payment failed"
        );

        wlMinted[msg.sender] = true;
        uint256 tokenId = totalSupply++;
        _mint(msg.sender, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    function mintPublic(string calldata uri) external returns (uint256) {
        require(mintPhase == Phase.PUBLIC, "public mint not active");
        require(totalSupply < MAX_SUPPLY, "sold out");
        require(mintCount[msg.sender] < MAX_PER_WALLET, "max per wallet reached");
        require(
            ITIP20(paymentToken).transferFrom(msg.sender, treasury, PUBLIC_PRICE),
            "payment failed"
        );

        mintCount[msg.sender]++;
        uint256 tokenId = totalSupply++;
        _mint(msg.sender, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    function mintTo(address to, string calldata uri) external returns (uint256) {
        require(minters[msg.sender], "not authorized minter");
        require(mintPhase != Phase.CLOSED, "minting closed");
        require(totalSupply < MAX_SUPPLY, "sold out");

        uint256 tokenId = totalSupply++;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    function setMintPhase(Phase phase) external onlyOwner {
        mintPhase = phase;
        emit PhaseChanged(phase);
    }

    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
        emit MerkleRootUpdated(root);
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }
}
