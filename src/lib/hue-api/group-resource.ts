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
  GroupedLightResource,
  LightResource as LightResourceData
} from "./types.js";
import LightResource from "./light-resource.js";

class GroupResource {
  private readonly api: ResourceApi;
  private readonly lightResource: LightResource;

  constructor(api: ResourceApi, lightResource: LightResource) {
    this.api = api;
    this.lightResource = lightResource;
  }

  public async getGroupResources(groupType: GroupType): Promise<CombinedGroupResource[]> {
    const endpoint = groupType === "zone" ? "/clip/v2/resource/zone" : "/clip/v2/resource/room";
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    if (res.data.length === 0) {
      return [];
    }

    const groupedLights = await this.getGroupedLights();
    const groupedLightById = new Map(groupedLights.map((groupedLight) => [groupedLight.id, groupedLight]));
    const hasGroupedLightService = (group: GroupResourceData): boolean =>
      group.services.some((service) => service.rtype === "grouped_light");

    const lights = await this.lightResource.getLights();
    const lightById = new Map(lights.map((light) => [light.id, light]));
    const lightFilterType = groupType === "zone" ? "light" : "device";
    const hasChildLight = (group: GroupResourceData): boolean =>
      group.children.some((child) => child.rtype === lightFilterType);

    const devices = await this.getDevices(groupType);

    return res.data
      .filter((entry) => hasGroupedLightService(entry) && hasChildLight(entry))
      .map((group) => {
        const services = group.services.filter((service) => service.rtype === "grouped_light");
        const mappedGroupedLights = services.map((service) => {
          const groupedLight = groupedLightById.get(service.rid);
          if (!groupedLight) {
            throw new HueError(`Grouped light resource not found for group ${group.id}`, StatusCodes.ServerError);
          }
          return groupedLight;
        });

        const mappedChildLights =
          groupType === "zone"
            ? group.children
                .map((child) => lightById.get(child.rid))
                .filter((light): light is LightResourceData => light !== undefined)
            : Array.from(
                new Set(
                  group.children
                    .map((child) => {
                      return (
                        devices
                          .get(child.rid)
                          ?.map((lightId) => lightById.get(lightId))
                          .filter((light): light is LightResourceData => light !== undefined) ?? []
                      );
                    })
                    .flat()
                )
              );

        return {
          id: group.id,
          id_v1: group.id_v1,
          lights: mappedChildLights,
          grouped_lights: mappedGroupedLights,
          type: group.type,
          metadata: {
            name: group.metadata.name
          }
        };
      });
  }

  private async getDevices(groupType: GroupType): Promise<Map<string, string[]>> {
    if (groupType !== "room") {
      return new Map<string, string[]>();
    }
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", "/clip/v2/resource/device");
    if (res.data) {
      return new Map(
        res.data.map((device) => [
          device.id,
          device.services.filter((service) => service.rtype === "light").map((service) => service.rid)
        ])
      );
    }
    return new Map<string, string[]>();
  }

  public async getGroupResource(entityId: string, groupType: GroupType): Promise<CombinedGroupResource> {
    const endpoint = groupType === "zone" ? `/clip/v2/resource/zone/${entityId}` : `/clip/v2/resource/room/${entityId}`;
    const res = await this.api.sendRequest<GroupResourceResponse>("GET", endpoint);
    if (res.data.length === 0) {
      throw new HueError("Group resource not found", StatusCodes.NotFound);
    }

    const group = res.data[0];
    const groups = await Promise.all(
      group.services
        .filter((service) => service.rtype === "grouped_light")
        .map(async (service) => await this.getGroupedLight(service.rid))
    );

    const lights = await this.lightResource.getLights();
    const lightById = new Map(lights.map((light) => [light.id, light]));

    let mappedChildLights: LightResourceData[];
    if (groupType === "zone") {
      mappedChildLights = group.children
        .filter((child) => child.rtype === "light")
        .map((child) => lightById.get(child.rid))
        .filter((light): light is LightResourceData => light !== undefined);
    } else {
      const devices = await this.getDevices(groupType);
      mappedChildLights = Array.from(
        new Set(
          group.children
            .filter((child) => child.rtype === "device")
            .map((child) => {
              return (
                devices
                  .get(child.rid)
                  ?.map((lightId) => lightById.get(lightId))
                  .filter((light): light is LightResourceData => light !== undefined) ?? []
              );
            })
            .flat()
        )
      );
    }

    return {
      id: group.id,
      id_v1: group.id_v1,
      lights: mappedChildLights,
      grouped_lights: groups.filter(
        (groupedLight): groupedLight is GroupedLightResource => groupedLight !== null
      ) as GroupedLightResource[],
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
