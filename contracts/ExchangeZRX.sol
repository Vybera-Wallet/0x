// SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.7.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ExchangeZRX is Ownable {

    // exchange fee in percents with base 100 (percent * 100)
    // e.g. 0.1% = 10, 1% = 100
    uint32 private constant percent100Base = 10000;
    // the fee factor in percents with base 100
    // e.g. fee is 1% = 100, feeFactor = 9900
    uint32 private _exchangeFeeFactor;
    // 0x protocol swap target contract
    address payable private _swapTarget;

    event BoughtTokens(IERC20 sellToken, IERC20 buyToken, uint256 boughtAmount, address indexed buyer);
    event WithdrawFee(IERC20 token, address indexed recipient, uint256 amount);
    event ChangeFee(uint32 fee);
    event ChangeSwapTarget(address indexed swapTarget);

    constructor(uint32 fee, address payable swapTarget) public {
        _exchangeFeeFactor = percent100Base - fee;
        _swapTarget = swapTarget;
    }

    function setFee(uint32 fee) external onlyOwner {
        require(fee <= percent100Base, "!fee > 100");
        _exchangeFeeFactor = percent100Base - fee;
        emit ChangeFee(fee);
    }

    function getFee() public view returns (uint32 fee) {
        fee = percent100Base - _exchangeFeeFactor;
    }

    function setSwapTarget(address payable swapTarget) external onlyOwner {
        _swapTarget = swapTarget;
        emit ChangeSwapTarget(swapTarget);
    }

    function getSwapTarget() public view returns(address) {
        return _swapTarget;
    }

    function withdrawFee(IERC20 token, address recipient) external onlyOwner {
        // get token balance of contract
        uint256 amount = token.balanceOf(address(this));
        // transef all amount to recipient
        token.transfer(recipient, amount);

        emit WithdrawFee(token, recipient, amount);
    }

    // Transfer ETH held by this contrat to recipient
    function withdrawETH(address payable recipient)
        external
        onlyOwner
    {
        recipient.transfer(address(this).balance);
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
        // The `data` field from the API response.
        bytes calldata swapCallData
    )
        external
        payable
    {
        // Track our balance of the buyToken to determine how much we've bought.
        uint256 boughtAmount = buyToken.balanceOf(address(this));

        // deposit sell token amount to current contract
        require(sellToken.transferFrom(msg.sender,  address(this), sellAmount), "!failed to transfer sell token");

        // Give `spender` an allowance to spend this contract's `sellToken`.
        if (sellToken.allowance(address(this), spender) == 0) {
            require(sellToken.approve(spender, uint(-1)), "!failed to approve sell token");
        }
        // Call the encoded swap function call
        (bool success,) = _swapTarget.call{value: msg.value}(swapCallData);
        require(success, '!swap failed');
        // Use our current buyToken balance to determine how much we've bought.
        boughtAmount = buyToken.balanceOf(address(this)) - boughtAmount;
        boughtAmount = (boughtAmount * _exchangeFeeFactor) / percent100Base;
        // transfer bought token
        buyToken.transfer(msg.sender, boughtAmount);

        emit BoughtTokens(sellToken, buyToken, boughtAmount, msg.sender);
    }
}