import { describe, expect, it } from "vitest";
import type { AchievementInfo, AchievementSummary } from "../../../lib/types";
import {
  isProtectedAchievement,
  mergeAchievementsWithSamSchema,
  sortAchievements,
} from "./AchievementRow";

function achievement(
  apiName: string,
  achieved: boolean,
  unlockTime = 0
): AchievementInfo {
  return {
    api_name: apiName,
    name: apiName,
    description: "",
    achieved,
    unlock_time: unlockTime,
    icon: null,
    icon_gray: null,
  };
}

describe("achievement detail helpers", () => {
  it("sorts unlocked achievements first and newest unlock first", () => {
    const source = [
      achievement("locked", false),
      achievement("older", true, 10),
      achievement("newer", true, 20),
    ];

    expect(sortAchievements(source).map((item) => item.api_name)).toEqual([
      "newer",
      "older",
      "locked",
    ]);
    expect(source.map((item) => item.api_name)).toEqual(["locked", "older", "newer"]);
  });

  it("merges local SAM protection metadata without dropping achievement state", () => {
    const summary: AchievementSummary = {
      total: 1,
      achieved: 0,
      achievements: [achievement("PROTECTED", false)],
    };
    const merged = mergeAchievementsWithSamSchema(summary, [
      {
        apiName: "PROTECTED",
        permission: 2,
        protectedAchievement: true,
        permissionVerified: true,
        source: "steamLocalSchema",
        flags: ["protected"],
      },
    ]);

    expect(merged.achievements[0]).toMatchObject({
      api_name: "PROTECTED",
      permission: 2,
      protected_achievement: true,
      protection_source: "samLocalSchema",
      protection_flags: ["protected"],
      permission_verified: true,
      permission_source: "steamLocalSchema",
    });
    expect(isProtectedAchievement(merged.achievements[0])).toBe(true);
    expect(summary.achievements[0]).not.toHaveProperty("permission");
  });

  it("marks runtime-only schema entries as permission-unverified", () => {
    const summary: AchievementSummary = {
      total: 1,
      achieved: 0,
      achievements: [achievement("Pal_Achievement_67", false)],
    };
    const merged = mergeAchievementsWithSamSchema(summary, [
      {
        apiName: "Pal_Achievement_67",
        permission: 0,
        protectedAchievement: false,
        permissionVerified: false,
        source: "steamRuntime",
        flags: ["RuntimeVerified", "PermissionUnavailable"],
      },
    ]);

    expect(merged.achievements[0]).toMatchObject({
      api_name: "Pal_Achievement_67",
      protected_achievement: false,
      permission_verified: false,
      permission_source: "steamRuntime",
    });
  });
});
