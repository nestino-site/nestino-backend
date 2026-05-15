import { SetMetadata } from '@nestjs/common';
import { IS_SITE_API_KEY_KEY } from '../identity.constants';

export const SiteApiKey = () => SetMetadata(IS_SITE_API_KEY_KEY, true);
