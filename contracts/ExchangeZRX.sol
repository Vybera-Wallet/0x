// SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.7.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
}

contract ExchangeZRX is Ownable, ReentrancyGuard {

    using SafeERC20 for IERC20;
    
    // exchange fee in percents with base 100 (percent * 100)
    // e.g. 0.1% = 10, 1% = 100
    uint32 private constant percent100Base = 10000;
    // the fee factor in percents with base 100
    // e.g. fee is 1% = 100, feeFactor = 9900
    uint32 private _exchangeFeeFactor;
    // 0x protocol swap target contract
    address payable private _swapTarget;

    IWETH private WETH;

    event BoughtTokens(IERC20 sellToken, IERC20 buyToken, uint256 boughtAmount, address indexed buyer);
    event WithdrawFee(IERC20 token, address indexed recipient, uint256 amount);
    event ChangeFee(uint32 fee);
    event ChangeSwapTarget(address indexed swapTarget);

    constructor(uint32 fee, address payable swapTarget, IWETH weth) public {
        _exchangeFeeFactor = percent100Base - fee;
        _swapTarget = swapTarget;
        WETH = weth;
    }

    function setFee(uint32 fee) external onlyOwner {
        require(fee <= percent100Base, "!fee > 100");
        _exchangeFeeFactor = percent100Base - fee;
        emit ChangeFee(fee);
    }

    function getFee() external view returns (uint32 fee) {
        fee = percent100Base - _exchangeFeeFactor;
    }

    function setSwapTarget(address payable swapTarget) external onlyOwner {
        _swapTarget = swapTarget;
        emit ChangeSwapTarget(swapTarget);
    }

    function getSwapTarget() external view returns(address) {
        return _swapTarget;
    }

    function withdrawFee(IERC20 token, address recipient) external onlyOwner {
        // get token balance of contract
        uint256 amount = token.balanceOf(address(this));
        // transef all amount to recipient
        token.safeTransfer(recipient, amount);

        emit WithdrawFee(token, recipient, amount);
    }

    // Transfer ETH held by this contrat to recipient
    function withdrawETH(address payable recipient)
        external
        onlyOwner
    {
        (bool success, ) = recipient.call{value: address(this).balance}(new bytes(0));
        require(success, 'ETH_TRANSFER_FAILED');        
    }

    // Payable fallback to allow this contract to receive protocol fee refunds.
    receive() external payable {}

    function _fillQuote(
        // The `sellTokenAddress` field from the API response.
        IERC20 sellToken,
        // The `buyTokenAddress` field from the API response.
        IERC20 buyToken,
        // The `allowanceTarget` field from the API response.
        address spender,
        // The `data` field from the API response.
        bytes memory swapCallData,
        // dex commition
        uint256 fee
    )
        internal
    {
        // Track our balance of the buyToken to determine how much we've bought.
        uint256 boughtAmount = buyToken.balanceOf(address(this));

        // Give `spender` an allowance to spend this contract's `sellToken`.
        if (sellToken.allowance(address(this), spender) == 0) {
            sellToken.safeApprove(spender, uint(-1));
        }
        // Call the encoded swap function call
        (bool success,) = _swapTarget.call{value: fee}(swapCallData);
        require(success, '!swap failed');

        // Use our current buyToken balance to determine how much we've bought.
        boughtAmount = buyToken.balanceOf(address(this)) - boughtAmount;
        boughtAmount = (boughtAmount * _exchangeFeeFactor) / percent100Base;
        // transfer bought token
        buyToken.safeTransfer(msg.sender, boughtAmount);

        emit BoughtTokens(sellToken, buyToken, boughtAmount, msg.sender);
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
        // The `data` field from the API response.
        bytes calldata swapCallData
    )
        nonReentrant
        external
        payable
    {
        // Track our balance of the sellToken
        uint256 sellTokenBefore = sellToken.balanceOf(address(this));
        // deposit sell token amount to current contract
        sellToken.safeTransferFrom(msg.sender,  address(this), sellAmount);
        _fillQuote(sellToken, buyToken, spender, swapCallData, msg.value);
        // check the sell token our balance to prevent to sell more, than user has
        require(sellTokenBefore <= sellToken.balanceOf(address(this)), "!invalid sell amount");
    }

    // swaps ETH->ERC20 tokens held by this contract using a 0x-API quote.
    function fillQuoteETH(
        uint256 sellAmount,
        IERC20 buyToken,
        address spender,
        bytes calldata swapCallData
    )
        nonReentrant
        external
        payable
    {
        require(msg.value >= sellAmount, "!invalid sell amount");
        uint256 balanceBefore = WETH.balanceOf((address(this)));
        // deposit ETH to WETH
        WETH.deposit{value: sellAmount}();
        _fillQuote(IERC20(WETH), buyToken, spender, swapCallData, msg.value - sellAmount);
        // check the sell token our balance to prevent to sell more, than user has
        require(balanceBefore <= WETH.balanceOf(address(this)), "!invalid sell amount");
    }
}