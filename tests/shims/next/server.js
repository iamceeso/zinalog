"use strict";

class NextRequest extends Request {
  constructor(input, init = {}) {
    super(input, init);
    this.nextUrl = new URL(typeof input === "string" ? input : input.url);
  }
}

class NextResponse extends Response {
  static json(body, init = {}) {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers,
    });
  }
}

module.exports = {
  NextRequest,
  NextResponse,
};
