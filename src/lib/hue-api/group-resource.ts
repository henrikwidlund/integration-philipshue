/**
 * Philips Hue API for the Remote Two/3 integration driver.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import { HueError, ResourceApi } from "./api.js";
import { StatusCodes } from "@unfoldedcircle/integration-api";
import {
  GroupResource as GroupResourceData,
  GroupResourceResponse,
  GroupResourceWithGroupLight,
  GroupType,
  LightResource,
  LightResourceResult
} from "./types.js";

class GroupResource {
  private readonly api: ResourceApi;

  constructor(api: ResourceApi) {
    this.api = api;
  }

  async getGroups(groupType: GroupType): Promise<GroupResourceData[]> {
    const endpoint = groupType === "zone" ? "/clip/v2/resource/zone" : "/clip/v2/resource/room";
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    return res.data;
  }

  async getGroup(id: string, groupType: GroupType): Promise<GroupResourceData> {
    const endpoint = groupType === "zone" ? `/clip/v2/resource/zone/${id}` : `/clip/v2/resource/room/${id}`;
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    if (!res.data || res.data.length === 0) {
      throw new HueError("Group not found", StatusCodes.NotFound);
    }
    return res.data[0];
  }

  async getGroupsWithLights(groupType: GroupType): Promise<GroupResourceWithGroupLight[]> {
    const groups = await this.getGroups(groupType);
    const groupedLights = await this.getGroupedLights();
    const groupedLightById = new Map(groupedLights.map((light) => [light.id, light]));
    let cleanedGroups = groups.map((group) => ({
      ...group,
      services: group.services.filter((service) => service.rtype === "grouped_light"),
      children: group.children.filter((child) => child.rtype === "light")
    }));

    cleanedGroups = cleanedGroups.filter((group) => group.services.length > 0 && group.children.length > 0);

    return cleanedGroups.map((group) => {
      const groupedLight = groupedLightById.get(group.services[0].rid);
      if (!groupedLight) {
        throw new HueError(`Grouped light resource not found for group ${group.id}`, StatusCodes.ServerError);
      }
      return {
        ...group,
        groupLight: groupedLight
      };
    });
  }

  private async getGroupedLights(): Promise<LightResource[]> {
    const res = await this.api.sendRequest<LightResourceResult>("GET", "/clip/v2/resource/grouped_light");
    return res.data;
  }
}

export default GroupResource;
