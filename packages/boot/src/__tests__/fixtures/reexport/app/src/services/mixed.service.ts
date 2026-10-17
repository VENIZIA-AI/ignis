import { kitService } from '../../../kit';
import { helper } from '../../../kit/helpers';

@kitService()
export class MixedService {
  value = helper();
}
