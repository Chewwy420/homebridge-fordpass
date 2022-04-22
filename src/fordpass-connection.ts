import { Logging } from 'homebridge';
import querystring from 'querystring';
import { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import { FordpassConfig } from './types/config';

const authUrl = 'https://sso.ci.ford.com/';
const vehiclesUrl = 'https://services.cx.ford.com/api/dashboard/v1/users/vehicles';
const defaultAppId = '71A3AD0A-CF46-4CCF-B473-FC7FE5BC4592';
const clientId = '9fb503e0-715b-47e8-adfd-ad4b7770f73b';
const userAgent = 'FordPass/5 CFNetwork/1325.0.1 Darwin/21.1.0';

export class Connection {
  private config: FordpassConfig;
  private readonly log: Logging;
  private applicationId: string;

  constructor(config: FordpassConfig, log: Logging) {
    this.config = config;
    this.log = log;
    this.applicationId = config.options?.region || defaultAppId;
  }

  async auth(): Promise<any> {
    const url = authUrl + 'oidc/endpoint/default/token';
    const options: AxiosRequestConfig = {
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      data: querystring.stringify({
        client_id: clientId,
        grant_type: 'password',
        username: this.config.username,
        password: this.config.password,
      }),
    };

    try {
      const result = await axios(options);
      if (result.status === 200 && result.data.access_token) {
        const nextResult = await axios.put(
          'https://api.mps.ford.com/api/oauth2/v1/token',
          {
            code: result.data.access_token,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': userAgent,
              'Application-Id': this.applicationId,
            },
          },
        );
        if (nextResult.status === 200 && nextResult.data.access_token) {
          this.config.access_token = nextResult.data.access_token;
          this.config.refresh_token = nextResult.data.refresh_token;
          return nextResult.data;
        } else {
          this.log.error(`Auth failed with status: ${nextResult.status}`);
        }
      } else {
        this.log.error(`Auth failed with status: ${result.status}`);
      }
      return;
    } catch (error: any) {
      this.log.error(`Auth failed with error: ${error.code || error.response.status}`);
      return;
    }
  }

  async refreshAuth(): Promise<any> {
    try {
      if (this.config.refresh_token) {
        const result = await axios.put(
          'https://api.mps.ford.com/api/oauth2/v1/refresh',
          {
            refresh_token: this.config.refresh_token,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': userAgent,
              'Application-Id': this.applicationId,
            },
          },
        );
        if (result.status === 200 && result.data.access_token) {
          this.config.access_token = result.data.access_token;
          this.config.refresh_token = result.data.refresh_token;
          return result.data;
        } else {
          this.log.error(`Auth failed with status: ${result.status}`);
        }
      } else {
        return await this.auth();
      }
      return;
    } catch (error: any) {
      this.log.error(`Auth failed with error: ${error.code || error.response.status}`);
      return;
    }
  }

  async getVehicles(): Promise<Array<any>> {
    if (!this.config.access_token) {
      return [];
    }
    const options: AxiosRequestConfig = {
      method: 'GET',
      url: vehiclesUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'Auth-Token': this.config.access_token,
        'Application-Id': this.applicationId,
      },
    };

    try {
      const result = await axios(options);
      if (result.status === 200 && result.data) {
        return result.data;
      } else {
        this.log.error(`Vehicles failed with status: ${result.status}`);
      }
      return [];
    } catch (error: any) {
      this.log.error(`Vehicles failed with error: ${error.code || error.response.status}`);
      return [];
    }
  }
}
