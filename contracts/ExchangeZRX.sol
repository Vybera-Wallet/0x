// SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.7.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract ExchangeZRX is Ownable {

    // exchange fee in percents
    uint public exchangeFee;

    event BoughtTokens(IERC20 sellToken, IERC20 buyToken, uint256 boughtAmount, address buyer);

    constructor(uint fee) public {
        exchangeFee = fee;
    }

    function setFee(uint fee) external onlyOwner {
        exchangeFee = fee;
    }

    // Swaps ERC20->ERC20 tokens held by this contract using a 0x-API quote.
    function fillQuote(
        // The `sellAmount` field from the API response.
        uint256 sellAmount,
        // The `sellTokenAddress` field from the API response.
        IERC20 sellToken,
        // The `buyTokenAddress` field from the API response.
        IERC20 buyToken,
        // The `allowanceTarget` field from the API response.
        address spender,
        // The `to` field from the API response.
        address payable swapTarget,
        // The `data` field from the API response.
        bytes calldata swapCallData
    )
        external
        payable
    {
        // Track our balance of the buyToken to determine how much we've bought.
        uint256 boughtAmount = buyToken.balanceOf(address(this));
        uint256 balanceBefore = address(this).balance;

        require(sellToken.allowance(msg.sender, address(this)) >= sellAmount, "sell amount is not approved to transfer");
        // deposit sell token amount to current contract
        require(sellToken.transferFrom(msg.sender,  address(this), sellAmount), "failed to transfer sell token");

        // Give `spender` an allowance to spend this contract's `sellToken`.
        require(sellToken.approve(spender, 0));
        require(sellToken.approve(spender, sellAmount), "failed to approve sell token for 0x");

        // Call the encoded swap function call on the contract at `swapTarget`,
        // passing along any ETH attached to this function call to cover protocol fees.
        (bool success,) = swapTarget.call{value: msg.value}(swapCallData);
        require(success, 'SWAP_CALL_FAILED');
        // Refund any unspent protocol fees to the sender.
        msg.sender.transfer(address(this).balance - balanceBefore);
        // Use our current buyToken balance to determine how much we've bought.
        boughtAmount = buyToken.balanceOf(address(this)) - boughtAmount;
        boughtAmount = (boughtAmount * (100 - exchangeFee)) / 100;
        // transfer bought token
        require(buyToken.transfer(msg.sender, boughtAmount));

        emit BoughtTokens(sellToken, buyToken, boughtAmount, msg.sender);
    }
}