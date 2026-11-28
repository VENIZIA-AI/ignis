import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { RecordUtility } from '@venizia/ignis-helpers/core';
import type { Http2ServerResponse } from 'node:http2';
import type { IGrpcNativeAnswer } from './common/types';
import { GrpcHeaderUtility } from './header.utility';
import { GrpcStatusUtility } from './status.utility';

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
   * error travels on HTTP 200.
   */
  static refuse(opts: { response: Http2ServerResponse; status: number; message: string }) {
    const { response, status, message } = opts;

    if (response.headersSent || response.stream.closed || response.stream.destroyed) {
      return;
    }

    response.stream.respond(
      {
        ':status': HTTP.ResultCodes.RS_2.Ok,
        [HTTP.Headers.CONTENT_TYPE]: 'application/grpc',
        [GRPC.Headers.GRPC_STATUS]: String(GrpcStatusUtility.fromHttp({ status })),
        [GRPC.Headers.GRPC_MESSAGE]: encodeURIComponent(message),
      },
      { endStream: true },
    );
  }

  /** Refuses with the answer a middleware gave: its status, and the `message` the error handler wrote. */
  static async refuseFrom(opts: { response: Http2ServerResponse; answer: Response }) {
    const { response, answer } = opts;
    const text = await answer.text();

    GrpcNativeWriter.refuse({
      response,
      status: answer.status,
      message: GrpcNativeWriter.readMessage({ text }) ?? answer.statusText,
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
