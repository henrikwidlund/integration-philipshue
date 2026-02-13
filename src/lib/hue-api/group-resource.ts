/**
 * Philips Hue API for the Remote Two/3 integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import { HueError, ResourceApi } from "./api.js";
import { StatusCodes } from "@unfoldedcircle/integration-api";
import {
  CombinedGroupResource,
  GroupResource as GroupResourceData,
  GroupLightResult,
  GroupResourceResponse,
  GroupType,
  GroupedLightResource
} from "./types.js";

class GroupResource {
  private readonly api: ResourceApi;

  constructor(api: ResourceApi) {
    this.api = api;
  }

  public async getGroupResources(groupType: GroupType): Promise<CombinedGroupResource[]> {
    const endpoint = groupType === "zone" ? "/clip/v2/resource/zone" : "/clip/v2/resource/room";
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    if (res.data.length === 0) {
      return [];
    }

    const groupedLights = await this.getGroupedLights();
    const groupedLightById = new Map(groupedLights.map((light) => [light.id, light]));

    const hasGroupedLightService = (group: GroupResourceData): boolean =>
      group.services.some((service) => service.rtype === "grouped_light");

    return res.data.filter(hasGroupedLightService).map((group) => {
      const services = group.services.filter((service) => service.rtype === "grouped_light");
      const mappedGroupedLights = services.map((service) => {
        const groupedLight = groupedLightById.get(service.rid);
        if (!groupedLight) {
          throw new HueError(`Grouped light resource not found for group ${group.id}`, StatusCodes.ServerError);
        }
        return groupedLight;
      });

      return {
        id: group.id,
        id_v1: group.id_v1,
        grouped_lights: mappedGroupedLights,
        type: group.type,
        metadata: {
          name: group.metadata.name
        }
      };
    });
  }

  public async getGroupResource(entityId: string, groupType: GroupType): Promise<CombinedGroupResource> {
    const endpoint = groupType === "zone" ? `/clip/v2/resource/zone/${entityId}` : `/clip/v2/resource/room/${entityId}`;
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    if (res.data.length === 0) {
      throw new HueError("Group resource not found", StatusCodes.NotFound);
    }

    const group = res.data[0];
    const groupedLights = await Promise.all(
      group.services
        .filter((service) => service.rtype === "grouped_light")
        .map(async (service) => await this.getGroupedLight(service.rid))
    );

    return {
      id: group.id,
      id_v1: group.id_v1,
      grouped_lights: groupedLights.filter((y) => y !== null) as GroupedLightResource[],
      type: group.type,
      metadata: {
        name: group.metadata.name
      }
    };
  }

  private async getGroupedLights(): Promise<GroupedLightResource[]> {
    const res = await this.api.sendRequest<GroupLightResult>("GET", "/clip/v2/resource/grouped_light");
    return res.data ?? [];
  }

  private async getGroupedLight(id: string): Promise<GroupedLightResource | null> {
    const res = await this.api.sendRequest<GroupLightResult>("GET", `/clip/v2/resource/grouped_light/${id}`);
    return res.data && res.data.length > 0 ? res.data[0] : null;
  }
}

export default GroupResource;
