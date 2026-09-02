import type { TBasicTokenServiceOptions } from './basic';
import type { TJWTTokenServiceOptions } from './jwt';
import type { TAuthenticationRestOptions } from './rest';
import type { IServiceAuthOptions } from './service';

/**
 * Composes the four topic option types into the framework's single authenticate config knob.
 * The only file in this folder allowed more than one sibling import - it is their parent.
 */
export interface IAuthenticateOptions {
  restOptions?: TAuthenticationRestOptions;
  jwtOptions?: TJWTTokenServiceOptions;
  basicOptions?: TBasicTokenServiceOptions;
  serviceOptions?: IServiceAuthOptions;
}
