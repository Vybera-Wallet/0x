// SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.7.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ExchangeZRX is Ownable {

    // exchange fee in percents with base 100 (percent * 100)
    // e.g. 0.1% = 10, 1% = 100
    uint private constant percent100Base = 10000;
    uint public exchangeFee;

    event BoughtTokens(IERC20 sellToken, IERC20 buyToken, uint256 boughtAmount, address buyer);
    event WithdrawFee(IERC20 token, address recipient, uint256 amount);

    constructor(uint fee) public {
        exchangeFee = fee;
    }

    function setFee(uint fee) external onlyOwner {
        require(fee <= percent100Base, "!fee > 100");
        exchangeFee = fee;
    }

    function withdrawFee(IERC20 token, address recipient) external onlyOwner {
        // get token balance of contract
        uint256 amount = token.balanceOf(address(this));
        // transef all amount to recipient
        token.transfer(recipient, amount);

        emit WithdrawFee(token, recipient, amount);
    }

    // Transfer ETH held by this contrat to recipient
    function withdrawETH(uint256 amount, address payable recipient)
        external
        onlyOwner
    {
        recipient.transfer(amount);
    }

    // Payable fallback to allow this contract to receive protocol fee refunds.
    receive() external payable {}

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

        // deposit sell token amount to current contract
        require(sellToken.transferFrom(msg.sender,  address(this), sellAmount), "!failed to transfer sell token");

        // Give `spender` an allowance to spend this contract's `sellToken`.
        if (sellToken.allowance(address(this), spender) == 0) {
            require(sellToken.approve(spender, uint(-1)), "!failed to approve sell token");
        }
        // Call the encoded swap function call
        (bool success,) = swapTarget.call{value: msg.value}(swapCallData);
        require(success, '!swap failed');
        // Refund any unspent protocol fees to the sender.
        msg.sender.transfer(address(this).balance - balanceBefore);
        // Use our current buyToken balance to determine how much we've bought.
        boughtAmount = buyToken.balanceOf(address(this)) - boughtAmount;
        boughtAmount = (boughtAmount * (percent100Base - exchangeFee)) / percent100Base;
        // transfer bought token
        require(buyToken.transfer(msg.sender, boughtAmount));

        emit BoughtTokens(sellToken, buyToken, boughtAmount, msg.sender);
    }
}