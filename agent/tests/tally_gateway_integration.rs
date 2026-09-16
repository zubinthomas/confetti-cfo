//! Exercises HttpTallyGateway's real HTTP round trip (request built, sent,
//! response parsed) against a tiny mock server standing in for Tally's
//! gateway - unlike tally_client's unit tests, this doesn't call
//! parse_ledger_balances directly, so it would catch a request/response
//! mismatch the unit tests can't see.
use std::thread;

use confetti_tally_agent::tally_client::HttpTallyGateway;

#[test]
fn fetches_and_parses_over_real_http() {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let addr = server.server_addr();

    let handle = thread::spawn(move || {
        let mut request = server.recv().unwrap();
        // Confirm the agent actually sent a request body (the TDL collection
        // XML), not just that it hit the URL.
        let mut body = String::new();
        request.as_reader().read_to_string(&mut body).unwrap();
        assert!(body.contains("<TYPE>Ledger</TYPE>"), "request should ask Tally for the Ledger collection");

        let response_xml = r#"<ENVELOPE>
            <LEDGER NAME="Cash-Hindustan Park">
                <PARENT>Cash-in-hand</PARENT>
                <CLOSINGBALANCE>150000.00</CLOSINGBALANCE>
            </LEDGER>
        </ENVELOPE>"#;
        let response = tiny_http::Response::from_string(response_xml)
            .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/xml"[..]).unwrap());
        request.respond(response).unwrap();
    });

    let gateway = HttpTallyGateway::new(&format!("http://{addr}"), None);
    let balances = gateway.fetch_ledger_balances().unwrap();

    handle.join().unwrap();

    assert_eq!(balances.len(), 1);
    assert_eq!(balances[0].name, "Cash-Hindustan Park");
    assert_eq!(balances[0].closing_balance, 150000.00);
}
