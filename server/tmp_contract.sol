// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract Wallet {
    uint256[] private bonusCodes;
    address private owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // 0.8 推荐：用 receive 代替 fallback 收 ETH（功能不变）
    receive() external payable {}

    function PushBonusCode(uint256 c) external onlyOwner {
        bonusCodes.push(c);
    }

    function PopBonusCode() external onlyOwner {
        if (bonusCodes.length > 0) bonusCodes.pop();
    }

    function UpdateBonusCodeAt(uint256 idx, uint256 c) external onlyOwner {
        require(idx < bonusCodes.length, "Index out of bounds");
        bonusCodes[idx] = c;
    }

    function Destroy() external onlyOwner {
        // 旧解析器对 selfdestruct 的 payable 转换敏感，这里显式强转
        address payable addr = payable(msg.sender);
        selfdestruct(addr);
    }

    /* ---- 只读辅助函数 ---- */
    function GetBonusCodesLength() external view returns (uint256) {
        return bonusCodes.length;
    }

    function GetBonusCodeAt(uint256 idx) external view returns (uint256) {
        require(idx < bonusCodes.length, "Index out of bounds");
        return bonusCodes[idx];
    }
}