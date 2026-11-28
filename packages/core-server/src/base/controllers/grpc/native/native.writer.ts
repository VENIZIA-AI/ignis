import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { RecordUtility } from '@venizia/ignis-helpers/core';
import type { Http2ServerResponse } from 'node:http2';
import type { IGrpcNativeAnswer } from './common/types';
import { GrpcHeaderUtility } from './header.utility';
import { GrpcStatusUtility } from './status.utility';

/** The longest `grpc-message` of a refusal, in characters: a larger header loses the whole answer. */
const MAX_MESSAGE_CHARACTERS = 1_024;

/** Writes the answer of a native gRPC call on its node stream. */
export class GrpcNativeWriter {
  /** Hands the call to ConnectRPC's handler, which reads the node request and writes the answer and its trailers. */
  static async answer(opts: IGrpcNativeAnswer) {
    const { call, handler, contextValues, headers, node } = opts;
    const universalRequest = node.universalRequestFromNodeRequest(
      call.request,
      call.response,
      undefined,
      contextValues,
    );
    const universalResponse = await handler(universalRequest);
    const header = universalResponse.header ?? new Headers();
    GrpcHeaderUtility.merge({ from: headers, into: header });

    await node.universalResponseToNodeResponse({ ...universalResponse, header }, call.response);
  }

  /**
   * Refuses a call before ConnectRPC saw it: one HEADERS frame that also ends the stream ("trailers-only"). A gRPC
   * error travels on HTTP 200. `headers` are the ones a middleware set on its answer.
   */
  static refuse(opts: {
    response: Http2ServerResponse;
    status: number;
    message: string;
    headers?: Headers;
  }) {
    const { response, status, message, headers = new Headers() } = opts;

    if (response.headersSent || response.stream.closed || response.stream.destroyed) {
      return;
    }

    const { stream } = response;
    const encoded = encodeURIComponent(message.slice(0, MAX_MESSAGE_CHARACTERS));

    stream.respond(
      {
        ...GrpcHeaderUtility.toRefusal({ headers }),
        ':status': HTTP.ResultCodes.RS_2.Ok,
        [HTTP.Headers.CONTENT_TYPE]: 'application/grpc',
        [GRPC.Headers.GRPC_STATUS]: String(GrpcStatusUtility.fromHttp({ status })),
        [GRPC.Headers.GRPC_MESSAGE]: encoded.slice(0, MAX_MESSAGE_CHARACTERS),
      },
      { endStream: true },
    );

    // A client still sending its request is told to stop, once the answer is out.
    setImmediate(() => {
      if (!stream.closed && stream.state.remoteClose === 0) {
        stream.close();
      }
    });
  }

  /** Refuses with the answer a middleware gave: its status, and the `message` the error handler wrote. */
  static async refuseFrom(opts: { response: Http2ServerResponse; answer: Response }) {
    const { response, answer } = opts;
    const text = await answer.text();

    GrpcNativeWriter.refuse({
      response,
      status: answer.status,
      message: GrpcNativeWriter.readMessage({ text }) ?? answer.statusText,
      headers: answer.headers,
    });
  }

  /** The `message` of a JSON error body, under the error root key too. */
  private static readMessage(opts: { text: string }): string | undefined {
    let body: unknown;

    try {
      body = JSON.parse(opts.text);
    } catch {
      return opts.text || undefined;
    }

    if (!RecordUtility.isRecord(body)) {
      return undefined;
    }

    const holder = [body, ...Object.values(body)].find(
      (entry) => RecordUtility.isRecord(entry) && typeof entry.message === 'string',
    );

    return RecordUtility.isRecord(holder) ? String(holder.message) : undefined;
  }
}
