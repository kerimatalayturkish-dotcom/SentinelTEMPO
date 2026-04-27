// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only ERC-20 with 6 decimals matching Tempo pathUSD/USDC.
///         `mint` is open so test fixtures can fund any address.
contract MockPathUSD is ERC20 {
    constructor() ERC20("Mock pathUSD", "mPUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
