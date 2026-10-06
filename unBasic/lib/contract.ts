
export function runContract(ns: NS, contract: CodingContractObject): boolean | string | undefined {
    const contractType = contract.type;
    switch (contractType) {
        case "Find Largest Prime Factor":
            return submitAnswer(ns, contract, findLargestPrimeFactor(contract.data as number));

        case "Subarray with Maximum Sum":
            return submitAnswer(ns, contract, maxSumSubarray(contract.data as number[]));

        case "Total Ways to Sum":
            return submitAnswer(ns, contract, numberOfWays(contract.data as number));

        case "Total Ways to Sum II":
            return submitAnswer(ns, contract, numberOfWaysII(contract.data[0] as number, contract.data[1] as number[]));

        case "Spiralize Matrix":
        case "Array Jumping Game":
            break;
        case "Array Jumping Game II":
            return submitAnswer(ns, contract, arrayJumpII(contract.data as number[]));

        case "Merge Overlapping Intervals":
            break;
        case "Generate IP Addresses":
            return submitAnswer(ns, contract, genIPs(contract.data as string));

        case "Algorithmic Stock Trader I":
            return submitAnswer(ns, contract, stockTrader(contract.data as number[]));

        case "Algorithmic Stock Trader II":
        case "Algorithmic Stock Trader III":
        case "Algorithmic Stock Trader IV":
        case "Minimum Path Sum in a Triangle":
        case "Unique Paths in a Grid I":
        case "Unique Paths in a Grid II":
        case "Shortest Path in a Grid":
        case "Sanitize Parentheses in Expression":
        case "Find All Valid Math Expressions":
        case "HammingCodes: Integer to Encoded Binary":
        case "HammingCodes: Encoded Binary to Integer":
        case "Proper 2-Coloring of a Graph":
            break;
        case "Compression I: RLE Compression":
            return submitAnswer(ns, contract, compressRLE(contract.data as string));
        case "Compression II: LZ Decompression":
        case "Compression III: LZ Compression":
            break;
        case "Encryption I: Caesar Cipher":
            const [text, shift] = contract.data as [string, number];
            return submitAnswer(ns, contract, caesarCipherDecrypt(text, shift));

        case "Encryption II: Vigenère Cipher":
        case "Square Root":
            break;
        case "Total Number of Primes":
            return submitAnswer(ns, contract, numOfPrimes(contract.data as number[]));

        case "Largest Rectangle in a Matrix":
            break;

        default:
            ns.tprint(`Unknown contract type: ${contractType}`);
            break;
    }
}

function submitAnswer(ns: NS, contract: CodingContractObject, answer: number | string | string[]): boolean | string {
    for (let attempt = 0; attempt <= contract.numTriesRemaining(); attempt++) {
        // Array answers must stay arrays; String(arr) comma-joins them and never matches.
        const reward = contract.submit(Array.isArray(answer) ? (answer as never) : String(answer));
        if (reward !== "") {
            ns.toast(`Solved contract ${contract.type} for ${reward}`, "success", 2500);
            return true;
        } else {
            ns.toast(`Failed attempt ${attempt + 1} for contract ${contract.type}`, "error", 1000);
        }
    }
    return "Failed to solve contract " + contract.type + ". Last answer: " + answer + ". Input data: " + JSON.stringify(contract.data);
}

function findLargestPrimeFactor(n: number) {
  let largestPrime = -1;
  while (n % 2 === 0) {
    largestPrime = 2;
    n /= 2;
  }
  for (let i = 3; i * i <= n; i += 2) {
    while (n % i === 0) {
      largestPrime = i;
      n /= i;
    }
  }
  if (n > 2) {
    largestPrime = n;
  }
  return largestPrime;
}

function numberOfWays(n: number) {
    const dp = new Array(n + 1).fill(0);
    dp[0] = 1;
    for (let i = 1; i <= n; i++) {
        for (let j = i; j <= n; j++) {
            dp[j] += dp[j - i];
        }
    }
    // The contract requires at least two addends, so exclude the partition {n}.
    return dp[n] - 1;
}

function numberOfWaysII(n: number, k:number[]): number {
    const dp = new Array(n + 1).fill(0);
    dp[0] = 1;
    for (const coin of k) {
        for (let j = coin; j <= n; j++) {
            dp[j] += dp[j - coin];
        }
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

function maxSumSubarray(arr: number[]): number {
    let maxSum = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        for (let j = i; j < arr.length; j++) {
            let currentSum = 0;
            for (let k = i; k <= j; k++) {
                currentSum += arr[k];
            }
            maxSum = Math.max(maxSum, currentSum);
        }
    }
    return maxSum;
}

function caesarCipherDecrypt(text: string, shift: number): string {
    let result = "";
    const normalizedShift = ((shift % 26) + 26) % 26;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
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

function arrayJumpII(arr: number[]): number {
    const n = arr.length;
    if (n <= 1) return 0;
    let jumps = 0;
    let reach = 0;
    let lastJump = -1;
    while (reach < n - 1) {
        let jumpedFrom = -1;
        for (let i = reach; i > lastJump; i--) {
            if (i + arr[i] > reach) {
                reach = i + arr[i];
                jumpedFrom = i;
            }
        }
        // No position in the reachable window can extend further: the end can't be reached.
        if (jumpedFrom === -1) return 0;
        lastJump = jumpedFrom;
        jumps++;
    }
    return jumps;
}

function genIPs(nums:string):string[] {
    const result: string[] = [];
    const n = nums.length;

    function backtrack(start: number, path: string[]) {
        if (path.length === 4 && start === n) {
            result.push(path.join('.'));
            return;
        }
        if (path.length === 4 || start === n) return;

        for (let len = 1; len <= 3; len++) {
            if (start + len > n) break;
            const segment = nums.substring(start, start + len);
            const segNum = parseInt(segment, 10);
            if (segNum > 255 || (segment.length > 1 && segment[0] === '0')) continue;
            path.push(segment);
            backtrack(start + len, path);
            path.pop();
        }
    }

    backtrack(0, []);
    return result;
}

function numOfPrimes(localRange: number[]): number {
    function isPrime(n: number): boolean {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 === 0 || n % 3 === 0) return false;
        for (let i = 5; i * i <= n; i += 6) {
            if (n % i === 0 || n % (i + 2) === 0) return false;
        }
        return true;
    }

    const [start, end] = localRange;
    let count = 0;
    for (let i = start; i <= end; i++) {
        if (isPrime(i)) count++;
    }
    return count;

}

function compressRLE(input: string): string {
    let result = "";
    let i = 0;
    while (i < input.length) {
        let runLength = 1;
        while (i + runLength < input.length && input[i + runLength] === input[i]) {
            runLength++;
        }
        // Counts must stay single-digit (1-9), so split longer runs into multiple chunks.
        let remaining = runLength;
        while (remaining > 0) {
            const chunk = Math.min(remaining, 9);
            result += String(chunk) + input[i];
            remaining -= chunk;
        }
        i += runLength;
    }
    return result;
}