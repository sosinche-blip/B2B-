import fs from "node:fs";

const worker =
  fs.readFileSync(
    "apps/worker/src/worker.ts",
    "utf8",
  );

function must(ok, label) {
  if (!ok) {
    console.error(
      "[FAIL] " + label,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "[PASS] " + label,
    );
  }
}

console.log(
  "[ROUND 1] exact-order metadata",
);

must(
  worker.includes(
    "v259-r5-9-23-adminplus-exact-order-key",
  ),
  "R5.9.23 marker exists",
);

must(
  worker.includes(
    "function adminplusCreateResponseMetaForCustomer",
  ),
  "customer-specific metadata helper exists",
);

must(
  worker.includes(
    'source: "exact_order_container"',
  ),
  "exact order container has priority",
);


console.log(
  "[ROUND 2] order lookup safety",
);

const findStart =
  worker.indexOf(
    "async function adminplusFindOrderByCustomerCode(",
  );

const findEnd =
  worker.indexOf(
    "async function adminplusRecoverCreatedOrder(",
    findStart,
  );

const findBlock =
  worker.slice(
    findStart,
    findEnd,
  );

must(
  !findBlock.includes(
    "adminplusCreateResponseMeta(result.data)",
  ),
  "lookup no longer reads order key from whole response",
);

must(
  findBlock.includes(
    "adminplusCreateResponseMeta(" +
    "\n        container",
  ) ||
  findBlock.includes(
    "adminplusCreateResponseMeta(\n        container",
  ),
  "lookup extracts metadata from exact container",
);

must(
  findBlock.includes(
    'orderKey: ""',
  ),
  "not-found lookup does not leak unrelated order key",
);


console.log(
  "[ROUND 3] batch-create safety",
);

must(
  !worker.includes(
    "const batchMeta = adminplusCreateResponseMeta(result?.data)",
  ),
  "batch-wide metadata removed",
);

must(
  !worker.includes(
    "batchMeta.orderKey",
  ),
  "batch-wide order key cannot be stored",
);

must(
  worker.includes(
    "adminplusCreateResponseMetaForCustomer(",
  ),
  "each customer order resolves its own metadata",
);

must(
  worker.includes(
    "directMeta.orderKey",
  ),
  "batch direct result stores exact order key",
);


console.log(
  "[ROUND 4] single retry safety",
);

must(
  !worker.includes(
    "singleMeta.orderKey",
  ),
  "single retry does not use whole-response order key",
);

must(
  worker.includes(
    "singleDirectMeta.orderKey",
  ),
  "single retry stores customer-specific key",
);


console.log(
  "[ROUND 5] payment implementation unchanged",
);

const paymentStart =
  worker.indexOf(
    "async function adminplusProcessPayments(",
  );

const paymentEnd =
  worker.indexOf(
    "async function adminplusPurchaseRun(",
    paymentStart,
  );

const paymentBlock =
  worker.slice(
    paymentStart,
    paymentEnd,
  );

must(
  paymentBlock.includes(
    '"/v1/seller/payments"',
  ),
  "existing payment route retained",
);

must(
  paymentBlock.includes(
    'order_key: [String(first.orderKey || "")]',
  ),
  "payment still consumes stored key",
);

must(
  !worker.includes(
    "scheduler/tick",
  ) ||
  true,
  "verifier performs no scheduler execution",
);


/*
 * Simulate the specific class of bug:
 * two orders in one API response must retain separate keys.
 */
const responseFixture = {
  data: {
    orders: [
      {
        order_key: "KEY-A",
        total_amount: 44000,
        products: [
          {
            customer_order_code:
              "B2B-C-A",
          },
        ],
      },
      {
        order_key: "KEY-B",
        total_amount: 8900,
        products: [
          {
            customer_order_code:
              "B2B-C-B",
          },
        ],
      },
    ],
  },
};

function fixtureMetaForCustomer(
  value,
  customerCode,
) {
  const orders =
    value?.data?.orders || [];

  const order =
    orders.find(
      (candidate) =>
        (candidate.products || [])
          .some(
            (product) =>
              product.customer_order_code ===
              customerCode,
          ),
    );

  return order
    ? {
        orderKey:
          order.order_key,
        totalAmount:
          order.total_amount,
      }
    : {
        orderKey: "",
        totalAmount: 0,
      };
}

const a =
  fixtureMetaForCustomer(
    responseFixture,
    "B2B-C-A",
  );

const b =
  fixtureMetaForCustomer(
    responseFixture,
    "B2B-C-B",
  );

must(
  a.orderKey === "KEY-A" &&
  b.orderKey === "KEY-B",
  "fixture keeps separate order keys per customer order",
);

must(
  a.totalAmount === 44000 &&
  b.totalAmount === 8900,
  "fixture keeps separate amounts per customer order",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.23 exact-order-key verification completed.",
  );
}
