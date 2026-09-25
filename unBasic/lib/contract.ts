
export function runContract(ns: NS, contract: CodingContractObject): boolean | undefined {
    const contractType = contract.type;
    switch (contractType) {
        case "Find Largest Prime Factor":
            return submitAnswer(ns, contract, findLargestPrimeFactor(contract.data as number));

        case "Subarray with Maximum Sum":
            return submitAnswer(ns, contract, maxSumSubarray(contract.data as number[]));

        case "Total Ways to Sum":
            return submitAnswer(ns, contract, numberOfWays(contract.data as number));

        case "Total Ways to Sum II":
        case "Spiralize Matrix":
        case "Array Jumping Game":
        case "Array Jumping Game II":
        case "Merge Overlapping Intervals":
        case "Generate IP Addresses":
            break;
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
        case "Compression I: RLE Compression":
        case "Compression II: LZ Decompression":
        case "Compression III: LZ Compression":
            break;
        case "Encryption I: Caesar Cipher":
            const [text, shift] = contract.data as [string, number];
            return submitAnswer(ns, contract, caesarCipherEncrypt(text, shift));
        case "Encryption II: Vigenère Cipher":
        case "Square Root":
        case "Total Number of Primes":
        case "Largest Rectangle in a Matrix":
            break;

        default:
            ns.tprint(`Unknown contract type: ${contractType}`);
            break;
    }
}

function submitAnswer(ns: NS, contract: CodingContractObject, answer: number | string): boolean | undefined {
    for (let attempt = 0; attempt <= contract.numTriesRemaining(); attempt++) {
        const reward = contract.submit(String(answer));
        if (reward !== "") {
            ns.toast(`Solved contract ${contract.type} for ${reward}`, "success", 1500);
            return true;
        }
    }
}

function findLargestPrimeFactor(n: number) {
  let largestPrime = -1;

  // Remove factors of 2
  while (n % 2 === 0) {
    largestPrime = 2;
    n /= 2;
  }

  // Check odd factors from 3 up to sqrt(n)
  for (let i = 3; i * i <= n; i += 2) {
    while (n % i === 0) {
      largestPrime = i;
      n /= i;
    }
  }

  // If n > 2, it's a prime
  if (n > 2) {
    largestPrime = n;
  }

  return largestPrime;
}

function numberOfWays(n: number, k: number = n) {
    const dp = new Array(n + 1).fill(0);

    dp[0] = 1;

    for (let i = 1; i <= k; i++) {
        for (let j = i; j <= n; j++) {
            dp[j] += dp[j - i];
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

function caesarCipherEncrypt(text: string, shift: number): string {
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char >= "A" && char <= "Z") {
            result += String.fromCharCode(((char.charCodeAt(0) - 65 + shift) % 26) + 65);
        } else if (char >= "a" && char <= "z") {
            result += String.fromCharCode(((char.charCodeAt(0) - 97 + shift) % 26) + 97);
        } else {
            result += char;
        }
    }
    return result.toUpperCase();
}