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
    return res.data ? res.data : [];
  }

  async getGroup(id: string, groupType: GroupType): Promise<GroupResourceData> {
    const endpoint = groupType === "zone" ? `/clip/v2/resource/zone/${id}` : `/clip/v2/resource/room/${id}`;
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    if (!res.data || res.data.length === 0) {
      throw new HueError("Group not found", StatusCodes.NotFound);
    }
    return res.data[0];
  }

  private cleanGroupsWithLights(
    groups: GroupResourceData[],
    groupedLightById: Map<string, LightResource>
  ): GroupResourceWithGroupLight[] {
    return (
      groups
        .map((group) => ({
          ...group,
          services: group.services.filter((service) => service.rtype === "grouped_light"),
          children: group.children.filter((child) => child.rtype === "light")
        }))
        .filter((group) => group.services.length > 0 && group.children.length > 0)
        .map((group) => {
          const groupedLight = groupedLightById.get(group.services[0].rid);
          if (!groupedLight) {
            throw new HueError(`Grouped light resource not found for group ${group.id}`, StatusCodes.ServerError);
          }
          return {
            ...group,
            groupLight: groupedLight
          };
        }) ?? []
    );
  }

  public async getGroupsWithLights(): Promise<Map<GroupType, GroupResourceWithGroupLight[]>> {
    const roomGroups = await this.getGroups("room");
    const zoneGroups = await this.getGroups("zone");
    const groupedLights = await this.getGroupedLights();
    const groupedLightById = new Map(groupedLights.map((light) => [light.id, light]));
    const cleanedRoomGroups = this.cleanGroupsWithLights(roomGroups, groupedLightById);
    const cleanedZoneGroups = this.cleanGroupsWithLights(zoneGroups, groupedLightById);
    return new Map([
      ["room", cleanedRoomGroups],
      ["zone", cleanedZoneGroups]
    ]);
  }

  private async getGroupedLights(): Promise<LightResource[]> {
    const res = await this.api.sendRequest<LightResourceResult>("GET", "/clip/v2/resource/grouped_light");
    return res.data;
  }
}

export default GroupResource;
