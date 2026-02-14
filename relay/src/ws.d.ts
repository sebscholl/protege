declare module 'ws' {
  export class WebSocketServer {
    constructor(args: {
      noServer: boolean;
    });

    handleUpgrade(
      request: unknown,
      socket: unknown,
      head: Buffer,
      callback: (socket: {
        send(payload: string | Buffer): void;
        close(
          code: number,
          reason: string,
        ): void;
        on(
          event: 'message' | 'close',
          listener: (payload?: unknown) => void,
        ): void;
      }) => void,
    ): void;

    close(callback: () => void): void;
  }
}
