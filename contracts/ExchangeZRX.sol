// SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

contract ExchangeZRX is Ownable, ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    
    // exchange fee in percents with base 100 (percent * 100)
    // e.g. 0.1% = 10, 1% = 100
    uint32 private constant percent100Base = 10000;
    // the fee factor in percents with base 100
    // e.g. fee is 1% = 100, feeFactor = 9900
    uint32 private _exchangeFeeFactor;
    // 0x protocol swap target contract
    address payable private _swapTarget;
    // holds addresses of fee tokens
    mapping(IERC20 => bool) private _mtokens;
    IERC20[] private _atokens;

    IWETH private WETH;

    event BoughtTokens(address sellToken, address buyToken, uint256 boughtAmount, address indexed buyer);
    event WithdrawFee(address token, address indexed recipient, uint256 amount);
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

    function tokenBalances() external view returns(IERC20[] memory, uint256[] memory) {
        uint256[] memory balances = new uint256[](_atokens.length);
        for (uint256 i = 0; i < balances.length; i++) {
            balances[i] = _atokens[i].balanceOf(address(this));
        }
        return (_atokens, balances);
    }

    function withdrawFee(IERC20 token, address recipient) external onlyOwner {
        _withdrawFee(token, recipient);
    }

    function batchWithdrawFee(IERC20[] calldata tokens, address recipient) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            _withdrawFee(tokens[i], recipient);
        }
    }

    function withdrawAllFee(address recipient) external onlyOwner {
        for (uint256 i = 0; i < _atokens.length; i++) {
            _withdrawFee(_atokens[i], recipient);
        }
        delete _atokens;
    }

    function _withdrawFee(IERC20 token, address recipient) internal {
        // get token balance of contract
        uint256 amount = token.balanceOf(address(this));
        // clear address
        delete _mtokens[token];
        // transef all amount to recipient
        if (amount > 0) {
            token.safeTransfer(recipient, amount);
            emit WithdrawFee(address(token), recipient, amount);
        }
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
        uint256 fee,
        // Buy ETH flag
        bool buyETH
    )
        internal returns (uint256 boughtAmount)
    {
        // Track our balance of the buyToken to determine how much we've bought.
        boughtAmount = buyToken.balanceOf(address(this));

        // Give `spender` an allowance to spend this contract's `sellToken`.
        if (sellToken.allowance(address(this), spender) == 0) {
            sellToken.safeApprove(spender, uint(-1));
        }

        if (sellToken != buyToken) {
            // Call the encoded swap function call
            (bool success,) = _swapTarget.call{value: fee}(swapCallData);
            require(success, '!swap failed');
        }

        // Use our current buyToken balance to determine how much we've bought.
        boughtAmount = buyToken.balanceOf(address(this)).sub(boughtAmount);
        boughtAmount = boughtAmount.mul(_exchangeFeeFactor).div(percent100Base);
        require(boughtAmount > 0, "swap return not match input");
        // transfer bought token
        if (buyETH) {
            WETH.withdraw(boughtAmount);
            (bool success, ) = msg.sender.call{value: boughtAmount}(new bytes(0));
            require(success, 'ETH_TRANSFER_FAILED');        
        } else {
            buyToken.safeTransfer(msg.sender, boughtAmount);
        }
        // add token to tokens array
        if (!_mtokens[buyToken]) {
            _mtokens[buyToken] = true;
            _atokens.push(buyToken);
        }
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
        uint256 boughtAmount = _fillQuote(sellToken, buyToken, spender, swapCallData, msg.value, false);
        // check the sell token our balance to prevent to sell more, than user has
        require(sellTokenBefore <= sellToken.balanceOf(address(this)), "!invalid sell amount");
        emit BoughtTokens(address(sellToken), address(buyToken), boughtAmount, msg.sender);
    }

    // swaps ETH->ERC20 tokens held by this contract using a 0x-API quote.
    function fillQuoteSellETH(
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
        uint256 boughtAmount = _fillQuote(IERC20(WETH), buyToken, spender, swapCallData, msg.value - sellAmount, false);
        // check the sell token our balance to prevent to sell more, than user has
        require(balanceBefore <= WETH.balanceOf(address(this)), "!invalid sell amount");
        emit BoughtTokens(address(0), address(buyToken), boughtAmount, msg.sender);
    }

    // swaps ERC20->ETH tokens held by this contract using a 0x-API quote.
    function fillQuoteBuyETH(
        uint256 sellAmount,
        IERC20 sellToken,
        address spender,
        bytes calldata swapCallData
    )
        nonReentrant
        external
        payable
    {
        // Track our balance of the sellToken
        uint256 sellTokenBefore = sellToken.balanceOf(address(this));
        uint256 balanceBefore = address(this).balance;
        // deposit sell token amount to current contract
        sellToken.safeTransferFrom(msg.sender,  address(this), sellAmount);
        uint256 boughtAmount = _fillQuote(sellToken, WETH, spender, swapCallData, msg.value, true);
        // check the sell token our balance to prevent to sell more, than user has
        require(sellTokenBefore <= sellToken.balanceOf(address(this)) &&
            (balanceBefore <= address(this).balance), "!invalid sell amount");
        emit BoughtTokens(address(sellToken), address(0), boughtAmount, msg.sender);
    }
}