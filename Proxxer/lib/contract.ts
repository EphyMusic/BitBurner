export function runContract(ns: NS, contract: CodingContractObject): boolean | string | undefined {
    switch (contract.type) {
        case "Find Largest Prime Factor":
            return submitAnswer(ns, contract, findLargestPrimeFactor(contract.data as number));
        case "Subarray with Maximum Sum":
            return submitAnswer(ns, contract, maxSumSubarray(contract.data as number[]));
        case "Total Ways to Sum":
            return submitAnswer(ns, contract, numberOfWays(contract.data as number));
        case "Total Ways to Sum II":
            return submitAnswer(ns, contract, numberOfWaysII(contract.data[0] as number, contract.data[1] as number[]));
        case "Array Jumping Game II":
            return submitAnswer(ns, contract, arrayJumpII(contract.data as number[]));
        case "Generate IP Addresses":
            return submitAnswer(ns, contract, genIPs(contract.data as string));
        case "Algorithmic Stock Trader I":
            return submitAnswer(ns, contract, stockTrader(contract.data as number[]));
        case "Compression I: RLE Compression":
            return submitAnswer(ns, contract, compressRLE(contract.data as string));
        case "Encryption I: Caesar Cipher": {
            const [text, shift] = contract.data as [string, number];
            return submitAnswer(ns, contract, caesarCipherDecrypt(text, shift));
        }
        case "Total Number of Primes":
            return submitAnswer(ns, contract, numOfPrimes(contract.data as number[]));
        default:
            return undefined;
    }
}

function submitAnswer(
    ns: NS,
    contract: CodingContractObject,
    answer: number | string | string[]
): boolean | string {
    const reward = contract.submit(Array.isArray(answer) ? answer as never : String(answer));
    if (reward !== "") {
        ns.toast(`Solved contract ${contract.type} for ${reward}`, "success", 2500);
        return true;
    }
    ns.toast(`Failed attempt for contract ${contract.type}`, "error", 1000);
    return `Failed to solve contract ${contract.type}. Answer: ${JSON.stringify(answer)}. Input data: ${JSON.stringify(contract.data)}`;
}

function findLargestPrimeFactor(value: number): number {
    let n = value;
    let largestPrime = -1;
    while (n % 2 === 0) {
        largestPrime = 2;
        n /= 2;
    }
    for (let factor = 3; factor * factor <= n; factor += 2) {
        while (n % factor === 0) {
            largestPrime = factor;
            n /= factor;
        }
    }
    if (n > 2) largestPrime = n;
    return largestPrime;
}

function numberOfWays(n: number): number {
    const dp = new Array(n + 1).fill(0);
    dp[0] = 1;
    for (let part = 1; part <= n; part++) {
        for (let sum = part; sum <= n; sum++) dp[sum] += dp[sum - part];
    }
    return dp[n] - 1;
}

function numberOfWaysII(n: number, coins: number[]): number {
    const dp = new Array(n + 1).fill(0);
    dp[0] = 1;
    for (const coin of coins) {
        for (let sum = coin; sum <= n; sum++) dp[sum] += dp[sum - coin];
    }
    return dp[n];
}

function stockTrader(prices: number[]): number {
    let lowestPrice = Infinity;
    let maxProfit = 0;
    for (const price of prices) {
        lowestPrice = Math.min(lowestPrice, price);
        maxProfit = Math.max(maxProfit, price - lowestPrice);
    }
    return maxProfit;
}

function maxSumSubarray(values: number[]): number {
    let maxSum = -Infinity;
    for (let start = 0; start < values.length; start++) {
        let currentSum = 0;
        for (let end = start; end < values.length; end++) {
            currentSum += values[end];
            maxSum = Math.max(maxSum, currentSum);
        }
    }
    return maxSum;
}

function caesarCipherDecrypt(text: string, shift: number): string {
    let result = "";
    const normalizedShift = ((shift % 26) + 26) % 26;
    for (const char of text) {
        if (char >= "A" && char <= "Z") {
            result += String.fromCharCode(((char.charCodeAt(0) - 65 - normalizedShift + 26) % 26) + 65);
        } else if (char >= "a" && char <= "z") {
            result += String.fromCharCode(((char.charCodeAt(0) - 97 - normalizedShift + 26) % 26) + 97);
        } else {
            result += char;
        }
    }
    return result;
}

function arrayJumpII(values: number[]): number {
    if (values.length <= 1) return 0;
    let jumps = 0;
    let currentEnd = 0;
    let furthestReach = 0;
    for (let index = 0; index < values.length - 1; index++) {
        furthestReach = Math.max(furthestReach, index + values[index]);
        if (index === currentEnd) {
            if (furthestReach <= index) return 0;
            jumps++;
            currentEnd = furthestReach;
        }
    }
    return jumps;
}

function genIPs(digits: string): string[] {
    const result: string[] = [];

    function backtrack(start: number, parts: string[]): void {
        if (parts.length === 4 && start === digits.length) {
            result.push(parts.join("."));
            return;
        }
        if (parts.length === 4 || start === digits.length) return;

        for (let length = 1; length <= 3 && start + length <= digits.length; length++) {
            const segment = digits.substring(start, start + length);
            const value = parseInt(segment, 10);
            if (value > 255 || (segment.length > 1 && segment[0] === "0")) continue;
            parts.push(segment);
            backtrack(start + length, parts);
            parts.pop();
        }
    }

    backtrack(0, []);
    return result;
}

function numOfPrimes(range: number[]): number {
    const [start, end] = range;
    let count = 0;
    for (let n = start; n <= end; n++) {
        if (n <= 1) continue;
        let prime = true;
        for (let factor = 2; factor * factor <= n; factor++) {
            if (n % factor === 0) {
                prime = false;
                break;
            }
        }
        if (prime) count++;
    }
    return count;
}

function compressRLE(input: string): string {
    let result = "";
    let index = 0;
    while (index < input.length) {
        let runLength = 1;
        while (index + runLength < input.length && input[index + runLength] === input[index]) runLength++;
        let remaining = runLength;
        while (remaining > 0) {
            const chunk = Math.min(remaining, 9);
            result += String(chunk) + input[index];
            remaining -= chunk;
        }
        index += runLength;
    }
    return result;
}
