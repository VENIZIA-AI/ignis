import { IJWTTokenPayload, JWTTokenService } from "@/components/auth";
import {
  getError,
  TestCaseDecisions,
  TestCaseHandler,
  TTestCaseDecision,
  ValueOrPromise,
} from "@venizia/ignis-helpers";

interface IArg {
  payload: IJWTTokenPayload;
  jwtSecret: string;
  applicationSecret: string;
  jwtExpiresIn: number;
}

export class TestCase001 extends TestCaseHandler<{}, IArg> {
  async execute() {
    if (!this.args) {
      throw getError({
        message: "[Test001Handler][execute] Invalid input args!",
      });
    }

    const { payload, jwtSecret, applicationSecret, jwtExpiresIn } = this.args;
    const jwtTokenService = new JWTTokenService({
      jwtSecret,
      applicationSecret,
      getTokenExpiresFn: () => {
        return Number(jwtExpiresIn);
      },
    });

    const token = await jwtTokenService.generate({ payload });
    this.logger.info("[execute] Token: %s", token);

    return { token };
  }

  getValidator():
    | ((opts: Awaited<ReturnType<typeof this.execute>>) => ValueOrPromise<TTestCaseDecision>)
    | null {
    return opts => {
      const { token } = opts;

      if (!token) {
        return TestCaseDecisions.FAIL;
      }

      return TestCaseDecisions.SUCCESS;
    };
  }
}
