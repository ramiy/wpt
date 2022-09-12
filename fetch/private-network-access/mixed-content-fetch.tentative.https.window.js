// META: script=/common/utils.js
// META: script=resources/support.sub.js
// META: timeout=long
//
// Spec: https://wicg.github.io/private-network-access
//
// These tests verify that secure contexts can fetch non-secure subresources
// from more private address spaces, avoiding mixed context checks, as long as
// they specify a valid `targetAddressSpace` fetch option that matches the
// target server's address space.

setup(() => {
  // Making sure we are in a secure context, as expected.
  assert_true(window.isSecureContext);
});

// Given `addressSpace`, returns the other three possible IP address spaces.
function otherAddressSpaces(addressSpace) {
  switch (addressSpace) {
    case "local": return ["unknown", "private", "public"];
    case "private": return ["unknown", "local", "public"];
    case "public": return ["unknown", "local", "private"];
  }
}

// Generates tests of `targetAddressSpace` for a single (source, target) pair.
//
// Scenarios:
//
//  - cors mode:
//    - missing targetAddressSpace option
//    - incorrect targetAddressSpace option (x3, see `otherAddressSpaces()`)
//    - failed preflight
//    - success
//    - success with PUT method (non-"simple" request)
//  - no-cors mode:
//    - success
//
function makeTests({
  sourceServer,
  targetServer,
}) {
  const makeTest = ({
    fetchOptions,
    targetBehavior,
    name,
    expected
  }) => {
    promise_test(t => fetchTest(t, {
      source: { server: sourceServer },
      target: {
        server: targetServer,
        behavior: targetBehavior,
      },
      fetchOptions,
      expected,
    }), `${sourceServer.name} to ${targetServer.name}: ${name}.`);
  };

  makeTest({
    name: "missing targetAddressSpace",
    targetBehavior: {
      preflight: PreflightBehavior.success(token()),
      response: ResponseBehavior.allowCrossOrigin(),
    },
    expected: FetchTestResult.FAILURE,
  });

  const correctAddressSpace = targetServer.addressSpace;

  for (const targetAddressSpace of otherAddressSpaces(correctAddressSpace)) {
    makeTest({
      name: `wrong targetAddressSpace "${targetAddressSpace}"`,
      targetBehavior: {
        preflight: PreflightBehavior.success(token()),
        response: ResponseBehavior.allowCrossOrigin(),
      },
      fetchOptions: { targetAddressSpace },
      expected: FetchTestResult.FAILURE,
    });
  }

  makeTest({
    name: "failed preflight",
    targetBehavior: {
      preflight: PreflightBehavior.failure(),
      response: ResponseBehavior.allowCrossOrigin(),
    },
    fetchOptions: { targetAddressSpace: correctAddressSpace },
    expected: FetchTestResult.FAILURE,
  });

  makeTest({
    name: "success",
    targetBehavior: {
      preflight: PreflightBehavior.success(token()),
      response: ResponseBehavior.allowCrossOrigin(),
    },
    fetchOptions: { targetAddressSpace: correctAddressSpace },
    expected: FetchTestResult.SUCCESS,
  });

  makeTest({
    name: "PUT success",
    targetBehavior: {
      preflight: PreflightBehavior.success(token()),
      response: ResponseBehavior.allowCrossOrigin(),
    },
    fetchOptions: {
      targetAddressSpace: correctAddressSpace,
      method: "PUT",
    },
    expected: FetchTestResult.SUCCESS,
  });

  makeTest({
    name: "no-cors success",
    targetBehavior: {
      preflight: PreflightBehavior.success(token()),
      response: ResponseBehavior.allowCrossOrigin(),
    },
    fetchOptions: {
      targetAddressSpace: correctAddressSpace,
      method: "no-cors",
    },
    expected: FetchTestResult.SUCCESS,
  });
}

function makeNoBypassTests({ sourceServer, targetServer }) {
  const prefix = `${sourceServer.name} to ${targetServer.name}: `;

  const correctAddressSpace = targetServer.addressSpace;
  for (const targetAddressSpace of otherAddressSpaces(correctAddressSpace)) {
    promise_test(t => fetchTest(t, {
      source: { server: sourceServer },
      target: {
        server: targetServer,
        behavior: {
          preflight: PreflightBehavior.success(token()),
          response: ResponseBehavior.allowCrossOrigin(),
        },
      },
      fetchOptions: { targetAddressSpace },
      expected: FetchTestResult.FAILURE,
    }), prefix + `wrong targetAddressSpace "${targetAddressSpace}".`);
  }

  promise_test(t => fetchTest(t, {
    source: { server: sourceServer },
    target: {
      server: targetServer,
      behavior: {
        preflight: PreflightBehavior.success(token()),
        response: ResponseBehavior.allowCrossOrigin(),
      },
    },
    fetchOptions: { targetAddressSpace: correctAddressSpace },
    expected: FetchTestResult.FAILURE,
  }), prefix + 'not a private network request.');
}

// Source: local secure context.
//
// Fetches to the local and private address spaces cannot use
// `targetAddressSpace` to bypass mixed content, as they are not otherwise
// blocked by Private Network Access.

makeNoBypassTests({
  sourceServer: Server.HTTPS_LOCAL,
  targetServer: Server.HTTP_LOCAL,
});

makeNoBypassTests({
  sourceServer: Server.HTTPS_LOCAL,
  targetServer: Server.HTTP_PRIVATE,
});

makeNoBypassTests({
  sourceServer: Server.HTTPS_LOCAL,
  targetServer: Server.HTTP_PUBLIC,
});

// Source: private secure context.
//
// Fetches to the local address space requires the right `targetAddressSpace`
// option, as well as a successful preflight response carrying a PNA-specific
// header.
//
// Fetches to the private address space cannot use `targetAddressSpace` to
// bypass mixed content, as they are not otherwise blocked by Private Network
// Access.

makeTests({
  sourceServer: Server.HTTPS_PRIVATE,
  targetServer: Server.HTTP_LOCAL,
});

makeNoBypassTests({
  sourceServer: Server.HTTPS_PRIVATE,
  targetServer: Server.HTTP_PRIVATE,
});

makeNoBypassTests({
  sourceServer: Server.HTTPS_PRIVATE,
  targetServer: Server.HTTP_PUBLIC,
});

// Source: public secure context.
//
// Fetches to the local and private address spaces require the right
// `targetAddressSpace` option, as well as a successful preflight response
// carrying a PNA-specific header.

makeTests({
  sourceServer: Server.HTTPS_PUBLIC,
  targetServer: Server.HTTP_LOCAL,
});

makeTests({
  sourceServer: Server.HTTPS_PUBLIC,
  targetServer: Server.HTTP_PRIVATE,
});

makeNoBypassTests({
  sourceServer: Server.HTTPS_PUBLIC,
  targetServer: Server.HTTP_PUBLIC,
});

// These tests verify that documents fetched from the `local` address space yet
// carrying the `treat-as-public-address` CSP directive are treated as if they
// had been fetched from the `public` address space.

promise_test(t => fetchTest(t, {
  source: {
    server: Server.HTTPS_LOCAL,
    treatAsPublic: true,
  },
  target: {
    server: Server.HTTP_LOCAL,
    behavior: {
      preflight: PreflightBehavior.success(token()),
      // Interesting: no need for CORS headers on same-origin final response.
    },
  },
  fetchOptions: { targetAddressSpace: "private" },
  expected: FetchTestResult.FAILURE,
}), 'https-treat-as-public to http-local: wrong targetAddressSpace "private".');

promise_test(t => fetchTest(t, {
  source: {
    server: Server.HTTPS_LOCAL,
    treatAsPublic: true,
  },
  target: {
    server: Server.HTTP_LOCAL,
    behavior: {
      preflight: PreflightBehavior.success(token()),
      // Interesting: no need for CORS headers on same-origin final response.
    },
  },
  fetchOptions: { targetAddressSpace: "local" },
  expected: FetchTestResult.SUCCESS,
}), "https-treat-as-public to http-local: success.");

promise_test(t => fetchTest(t, {
  source: {
    server: Server.HTTPS_LOCAL,
    treatAsPublic: true,
  },
  target: {
    server: Server.HTTP_PRIVATE,
    behavior: {
      preflight: PreflightBehavior.success(token()),
      response: ResponseBehavior.allowCrossOrigin(),
    },
  },
  fetchOptions: { targetAddressSpace: "local" },
  expected: FetchTestResult.FAILURE,
}), 'https-treat-as-public to http-private: wrong targetAddressSpace "local".');

promise_test(t => fetchTest(t, {
  source: {
    server: Server.HTTPS_LOCAL,
    treatAsPublic: true,
  },
  target: {
    server: Server.HTTP_PRIVATE,
    behavior: {
      preflight: PreflightBehavior.success(token()),
      response: ResponseBehavior.allowCrossOrigin(),
    },
  },
  fetchOptions: { targetAddressSpace: "private" },
  expected: FetchTestResult.SUCCESS,
}), "https-treat-as-public to http-private: success.");
