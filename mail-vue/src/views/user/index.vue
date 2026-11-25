<template>
  <div class="user-box">
    <div class="user-toolbar">
      <div class="toolbar-row toolbar-row-top">
        <div class="toolbar-row-top-left">
          <div class="pill-group">
            <span class="pill-group-label">{{ $t('userStatus') }}</span>
            <div class="segmented-pills" role="radiogroup" :aria-label="$t('userStatus')">
              <button
                v-for="option in statusOptions"
                :key="option.value"
                type="button"
                class="pill-item"
                :class="{ active: params.status === option.value }"
                role="radio"
                :aria-checked="params.status === option.value"
                @click="selectStatus(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="pill-group">
            <span class="pill-group-label">{{ $t('registerSort') }}</span>
            <div class="segmented-pills" role="radiogroup" :aria-label="$t('registerSort')">
              <button
                v-for="option in sortOptions"
                :key="option.value"
                type="button"
                class="pill-item"
                :class="{ active: !hasTableSort && params.timeSort === option.value }"
                role="radio"
                :aria-checked="!hasTableSort && params.timeSort === option.value"
                @click="selectTimeSort(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="toolbar-row-top-right">
          <span class="user-count" v-if="!first || total > 0">{{ $t('userCount', {total: total}) }}</span>
        </div>
      </div>

      <div class="toolbar-row toolbar-row-bottom">
        <div class="user-ops-group">
          <el-tooltip effect="dark" :content="$t('addUser')" placement="bottom" :show-after="300">
            <button type="button" class="tool-icon-btn is-primary" :aria-label="$t('addUser')" @click="openAdd">
              <Icon icon="ion:add-outline" width="19" height="19" />
            </button>
          </el-tooltip>
          <el-tooltip effect="dark" :content="$t('refresh')" placement="bottom" :show-after="300">
            <button type="button" class="tool-icon-btn" :aria-label="$t('refresh')" @click="refresh">
              <Icon icon="ion:reload" width="16" height="16" />
            </button>
          </el-tooltip>
          <el-tooltip effect="dark" :content="$t('delete')" placement="bottom" :show-after="300">
            <button
              type="button"
              class="tool-icon-btn is-danger"
              :aria-label="$t('delete')"
              :disabled="selectedUsers.length === 0"
              @click="delUser"
            >
              <Icon icon="uiw:delete" width="15" height="15" />
            </button>
          </el-tooltip>
        </div>

        <span class="toolbar-divider" aria-hidden="true" />

        <div class="search-controls">
          <el-input
            v-model="params.email"
            class="search-keyword-input"
            clearable
            autocomplete="off"
            :placeholder="$t('searchByEmail')"
            @keyup.enter="search"
            @clear="search"
          >
            <template #prefix>
              <Icon icon="iconoir:search" width="15" height="15" class="input-prefix-icon" />
            </template>
          </el-input>

          <div class="search-btn-group">
            <el-button type="primary" class="search-action-btn" @click="search">
              {{ $t('search') }}
            </el-button>
            <el-button class="search-action-btn" :disabled="!hasActiveFilter" @click="resetFilters">
              {{ $t('reset') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div>
        <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
             :style="first ? 'background: transparent' : ''">
          <loading/>
        </div>
        <el-table
            @filter-change="tableFilter"
            @selection-change="handleSelectionChange"
            @sort-change="handleTableSortChange"
            :empty-text="first ? '' : null"
            :data="users"
            :preserve-expanded-content="preserveExpanded"
            style="width: 100%;"
            ref="tableRef"
            @cell-contextmenu="handleContextmenu"
            :cell-class-name="cellClassName"
        >
          <el-table-column :width="expandWidth" type="selection" :selectable="row => row.type !== 0" />
          <el-table-column show-overflow-tooltip :tooltip-formatter="tableRowFormatter" :label="$t('tabEmailAddress')"
                           :min-width="emailWidth">
            <template #default="props">
              <div style="display: flex;gap: 5px;align-items: center">
                <div class="email-row">{{ props.row.email }}</div>
                <template v-if="oauthPlatform(props.row)">
                  <el-avatar v-if="oauthPlatform(props.row).iconType === 'image'"
                             :src="oauthPlatform(props.row).icon"
                             :size="16"
                             class="oauth-platform-icon"/>
                  <Icon v-else
                        :icon="oauthPlatform(props.row).icon"
                        width="16"
                        height="16"
                        class="oauth-platform-icon"/>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column :formatter="formatterReceive" label-class-name="receive" column-key="receive"
                           :filtered-value="filteredValue" :filters="filters" :width="receiveWidth"
                           :label="$t('tabReceived')"
                           prop="receiveEmailCount"/>
          <el-table-column :formatter="formatterSend" label-class-name="send" column-key="send"
                           :filtered-value="filteredValue" :filters="filters" v-if="sendNumShow" :label="$t('tabSent')"
                           prop="sendEmailCount"/>
          <el-table-column :formatter="formatterAccount" label-class-name="account" column-key="account"
                           :filtered-value="filteredValue" :filters="filters" v-if="accountNumShow"
                           :label="$t('tabMailboxes')"
                           prop="accountCount"/>
          <el-table-column v-if="createTimeShow" :label="$t('tabRegisteredAt')" min-width="160" prop="createTime">
            <template #default="props">
              {{ tzDayjs(props.row.createTime).format('YYYY-MM-DD HH:mm') }}
            </template>
          </el-table-column>
          <el-table-column v-if="statusShow" min-width="60px" :label="$t('tabStatus')" prop="status">
            <template #default="props">
              <el-tag disable-transitions v-if="props.row.isDel === 1" type="info">{{ $t('deleted') }}</el-tag>
              <el-tag disable-transitions v-else-if="props.row.status === 0" type="primary">{{ $t('active') }}</el-tag>
              <el-tag disable-transitions v-else-if="props.row.status === 1" type="danger">{{ $t('banned') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="typeShow" :label="$t('tabRole')" min-width="140" prop="type">
            <template #default="props">
              <div class="type">
                {{ toRoleName(props.row.type) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="$t('tabSetting')" :width="settingWidth">
            <template #default="props">
              <el-button size="small" type="primary" v-if="(props.row.type === 0 && userStore.user.type !== 0)" >{{ $t('action') }}</el-button>
              <el-dropdown v-else >
                <el-button size="small" type="primary">{{ $t('action') }}</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openSetPwd(props.row)" >{{ $t('chgPwd') }}</el-dropdown-item>
                    <el-dropdown-item @click="openSetType(props.row)" >{{ $t('perm') }}</el-dropdown-item>
                    <template v-if="props.row.type !== 0">
                      <el-dropdown-item v-if="props.row.isDel !== 1" @click="setStatus(props.row)">
                        {{ setStatusName(props.row) }}
                      </el-dropdown-item>
                      <el-dropdown-item v-else @click="restore(props.row)">{{ $t('restore') }}</el-dropdown-item>
                    </template>
                    <el-dropdown-item @click="openAccountList(props.row.userId)" >{{ $t('account') }}</el-dropdown-item>
                    <el-dropdown-item @click="openDetails(props.row)" >{{ $t('details') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination" v-if="total > 10">
          <el-pagination
              :size="pageSize"
              :current-page="params.num"
              :page-size="params.size"
              :pager-count="pagerCount"
              :page-sizes="[10, 15, 20, 25, 30, 50]"
              background
              :layout="layout"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
          <el-pagination
              v-if="phonePageShow"
              :size="pageSize"
              :current-page="params.num"
              :page-size="params.size"
              :pager-count="pagerCount"
              :page-sizes="[10, 15, 20, 25, 30, 50]"
              background
              layout="sizes, total"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
        </div>
      </div>
    </el-scrollbar>
    <el-dialog class="dialog" v-model="setPwdShow" :title="$t('changePassword')" @closed="resetUserForm">
      <div class="dialog-box">
        <el-input v-model="userForm.password" type="password" :placeholder="$t('newPassword')" autocomplete="off" @keyup.enter="updatePwd">
        </el-input>
        <el-button class="btn" type="primary" :loading="settingLoading" @click="updatePwd"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="dialog" v-model="setTypeShow" :title="$t('changePerm')" @closed="resetUserForm">
      <div class="dialog-box">
        <el-input disabled :model-value="$t('admin')" v-if="userForm.type === 0"/>
        <el-select v-else v-model="userForm.type" placeholder="Select">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-button :disabled="userForm.type === 0" class="btn" :loading="settingLoading" type="primary" @click="setType"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="showAdd" :title="$t('addUser')" @closed="resetAddForm">
      <div class="container">
        <el-input v-model="addForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
          <template #append>
            <div @click.stop="openSelect">
              <div inert>
                <el-select
                    ref="mySelect"
                    v-model="addForm.suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
              </div>
              <div>
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input type="password" v-model="addForm.password" :placeholder="$t('password')" @keyup.enter="submit"/>
        <el-select v-model="addForm.type" :placeholder="$t('perm')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="account-dialog" v-model="accountShow" :title="t('userAccount')" @closed="resetAccountList" >
      <el-table :data="accountList" style="height: 480px" v-loading="accountLoading" element-loading-background="transparent" :empty-text="accountLoading ? '' : null">
        <el-table-column property="email" :label="t('emailAccount')" >
          <template #default="props">
            <div class="email-row">{{ props.row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column property="address" :label="t('tabStatus')"  :width="locale === 'en' ? 75 : 65" >
          <template #default="props">
            <el-tag type="primary" disable-transitions v-if="props.row.isDel === 0">{{$t('active')}}</el-tag>
            <el-tag type="info" disable-transitions v-if="props.row.isDel === 1">{{$t('deleted')}}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('action')" :width="locale === 'en' ? 75 : 65" >
          <template #default="props">
            <el-dropdown trigger="click">
              <el-button type="primary" size="small">{{t('action')}}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="deleteAccount(props.row)">{{ $t('delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div class="account-pagination">
        <el-pagination
            :disabled="accountLoading"
            background

            layout="prev, pager, next"
            :pager-count="3"
            :total="accountParams.total"
            @current-change="accountCurChange"
        />
      </div>
    </el-dialog>
    <el-dialog class="account-dialog" v-model="detailsShow" :title="t('userDetails')"  >
      <div class="details">
        <div v-if="userDetails.platform || userDetails.username" class="oauth-details">
          <el-avatar :src="userDetails.avatar" :size="30" class="oauth-avatar"/>
          <span>{{ $t('username') }}：{{ userDetails.username }}</span>
          <span v-if="userDetails.trustLevel != null">
            {{ $t('trustLevel') }}：<el-tag type="success">{{ userDetails.trustLevel }}</el-tag>
          </span>
        </div>
        <div v-if="!sendNumShow"><span
            class="details-item-title">{{ $t('tabSent') }}:</span>{{ userDetails.sendEmailCount }}
        </div>
        <div v-if="!accountNumShow"><span class="details-item-title">{{ $t('tabMailboxes') }}:</span>{{
            userDetails.accountCount
          }}
        </div>
        <div v-if="!createTimeShow"><span class="details-item-title">{{ $t('tabRegisteredAt') }}:</span>{{
            tzDayjs(userDetails.createTime).format('YYYY-MM-DD HH:mm')
          }}
        </div>
        <div v-if="!typeShow"><span class="details-item-title">{{ $t('perm') }}:</span>
          {{ toRoleName(userDetails.type) }}
        </div>
        <div v-if="!statusShow">
          <span class="details-item-title">{{ $t('tabStatus') }}:</span>
          <el-tag disable-transitions v-if="userDetails.isDel === 1" type="info">{{ $t('deleted') }}</el-tag>
          <el-tag disable-transitions v-else-if="userDetails.status === 0" type="primary">{{ $t('active') }}
          </el-tag>
          <el-tag disable-transitions v-else-if="userDetails.status === 1" type="danger">{{ $t('banned') }}
          </el-tag>
        </div>
        <div><span class="details-item-title">{{ $t('registrationIp') }}:</span>{{
            userDetails.createIp || $t('unknown')
          }}
        </div>
        <div><span class="details-item-title">{{ $t('recentIP') }}:</span>{{
            userDetails.activeIp || $t('unknown')
          }}
        </div>
        <div><span class="details-item-title">{{ $t('recentActivity') }}:</span>{{
            userDetails.activeTime ? tzDayjs(userDetails.activeTime).format('YYYY-MM-DD') : $t('unknown')
          }}
        </div>
        <div><span
            class="details-item-title">{{ $t('loginDevice') }}:</span>{{ userDetails.device || $t('unknown') }}
        </div>
        <div><span class="details-item-title">{{ $t('loginSystem') }}:</span>{{ userDetails.os || $t('unknown') }}
        </div>
        <div><span
            class="details-item-title">{{ $t('browserLogin') }}:</span>{{ userDetails.browser || $t('unknown') }}
        </div>
        <div>
          <span class="details-item-title">{{ $t('sendEmail') }}:</span>
          <span>{{ formatSendCount(userDetails) }}</span>
          <el-tag style="margin-left: 10px" v-if="userDetails.sendAction.hasPerm">
            {{ formatSendType(userDetails) }}
          </el-tag>
          <el-button size="small" style="margin-left: 10px"
                     v-if="userDetails.sendAction.hasPerm && userDetails.sendAction.sendCount"
                     @click="resetSendCount(userDetails)" type="primary">{{ $t('reset') }}
          </el-button>
        </div>
      </div>
    </el-dialog>
    <el-dropdown
        :show-timeout="0"
        :hide-timeout="0"
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="openSetPwd(rightClickUser)">
            <template #default>
              <div class="right-dropdown-item">
                <icon icon="fluent:fingerprint-20-filled" width="22" height="22" />
                <span>{{t('changePassword')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openSetType(rightClickUser)">
            <template #default>
              <div class="right-dropdown-item">
                <icon icon="fluent:lock-closed-16-regular" width="21" height="21" />
                <span>{{ t('setRole') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickUser.type !== 0">
            <template #default>
              <div class="right-dropdown-item" v-if="rightClickUser.isDel !== 1" @click="setStatus(rightClickUser)" >
                <Icon icon="ion:reload" v-if="rightClickUser.status" style="margin-left: 1px;margin-right: 1px" width="19" height="19" />
                <Icon icon="ion:ban-outline" v-else style="margin-left: 1px;margin-right: 1px" width="19" height="19" />
                <span>{{ setRightStatusName(rightClickUser) }}</span>
              </div>
              <div class="right-dropdown-item" v-else @click="restore(rightClickUser)">
                <Icon icon="ion:reload" style="margin-left: 1px;margin-right: 1px" width="19" height="19" />
                <span>{{ t('restoreUser') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openAccountList(rightClickUser.userId)" >
            <template #default>
              <div class="right-dropdown-item" >
                <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
                <span>{{ t('userEmail') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openDetails(rightClickUser)" >
            <template #default>
              <div class="right-dropdown-item" >
                <Icon icon="si:user-alt-2-line" width="20" height="20" />
                <span>{{ t('userDetails') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickUser.type !== 0" @click="delOneUser(rightClickUser)" >
            <template #default>
              <div class="right-dropdown-item" >
                <Icon icon="uiw:delete" width="18" height="18" style="margin-left: 1px;margin-right: 1px" />
                <span>{{ t('adminDeleteUser') }}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {computed, defineOptions, h, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'
import {
  userList,
  userDelete,
  userSetPwd,
  userSetStatus,
  userSetType,
  userAdd,
  userRestSendCount,
  userRestore,
  userDeleteAccount,
  userAllAccount
} from '@/request/user.js'
import {roleSelectUse} from "@/request/role.js";
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import {tzDayjs} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useRoleStore} from "@/store/role.js";
import {useUserStore} from "@/store/user.js";
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'user'
})

const {t, locale} = useI18n();
const roleStore = useRoleStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const oauthPlatformMap = {
  google: { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
  github: { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
  linuxdo: { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
}
function oauthPlatform(row) {
  if (row?.platform && oauthPlatformMap[row.platform]) {
    return oauthPlatformMap[row.platform]
  }
  // 旧数据可能只有 username、无 platform
  if (row?.username) return oauthPlatformMap.linuxdo
  return null
}
const filteredValue = ['normal', 'del']
const filters = [{text: t('active'), value: 'normal'}, {text: t('deleted'), value: 'del'}]
const preserveExpanded = ref(false)
const emailWidth = ref(230)
const expandWidth = ref(40)
const settingWidth = ref(null)
const sendNumShow = ref(true)
const accountNumShow = ref(true)
const createTimeShow = ref(true)
const statusShow = ref(true)
const typeShow = ref(true)
const receiveWidth = ref(null)
const phonePageShow = ref(false)
const detailsShow = ref(false);
const layout = ref('prev, pager, next,  sizes, total')
const pageSize = ref('')
const users = ref([])
const tableRef = ref({})
const userDetails = ref({})
const total = ref(0)
const first = ref(true)
const scrollbarRef = ref(null)
const accountLoading = ref(false)
const dropdownRef = ref(null);
const dropdownShow = ref(false);
const rightClickUser = ref({});
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})
const domainList = settingStore.domainList

const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0],
  password: '',
  type: null,
})

const params = reactive({
  email: '',
  num: 1,
  size: 15,
  timeSort: 0,
  status: -1
})
const selectedUsers = ref([])
const tableSortState = reactive({
  prop: '',
  order: ''
})
const hasTableSort = computed(() => Boolean(tableSortState.prop && tableSortState.order))
const statusOptions = computed(() => [
  {label: t('all'), value: -1},
  {label: t('active'), value: 0},
  {label: t('banned'), value: 1},
  {label: t('deleted'), value: -2},
])
const sortOptions = computed(() => [
  {label: t('newestFirst'), value: 0},
  {label: t('oldestFirst'), value: 1},
])
const hasActiveFilter = computed(() =>
  Boolean((params.email || '').trim())
  || params.status !== -1
  || params.timeSort !== 0
  || hasTableSort.value
)
let chooseUser = {}
const userForm = reactive({
  password: null,
  type: -1,
  userId: 0,
})

const showAdd = ref(false)
const accountShow = ref(false)
const addLoading = ref(false);
const setTypeShow = ref(false)
const setPwdShow = ref(false)
const pagerCount = ref(10)
const settingLoading = ref(false)
const tableLoading = ref(true)
const roleList = reactive([])
const mySelect = ref({})
const accountList = reactive([])
const accountParams = reactive({
  size: 10,
  num: 0,
  total: 0,
  userId: 0,
})

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})

const VALID_PAGE_SIZES = new Set([10, 15, 20, 25, 30, 50])
const VALID_STATUSES = new Set([-1, 0, 1, -2])
const VALID_TIME_SORTS = new Set([0, 1])

const paramsStar = localStorage.getItem('user-params')
if (paramsStar) {
  try {
    const localParams = JSON.parse(paramsStar)
    if (localParams && typeof localParams === 'object') {
      const num = Number(localParams.num)
      const size = Number(localParams.size)
      const timeSort = Number(localParams.timeSort)
      const status = Number(localParams.status)
      params.num = Number.isInteger(num) && num >= 1 ? num : 1
      params.size = VALID_PAGE_SIZES.has(size) ? size : 15
      params.timeSort = VALID_TIME_SORTS.has(timeSort) ? timeSort : 0
      params.status = VALID_STATUSES.has(status) ? status : -1
    }
  } catch {
    localStorage.removeItem('user-params')
  }
}

watch(() => ({
  num: params.num,
  size: params.size,
  timeSort: params.timeSort,
  status: params.status
}), (val) => {
  localStorage.setItem('user-params', JSON.stringify(val))
}, {
  deep: true
})

watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

watch(() => userStore.refreshList, () => {
  getUserList(false)
})

getUserList()

const filterItem = reactive({
  send: ['normal', 'del'],
  account: ['normal', 'del'],
  receive: ['normal', 'del']
})

window.addEventListener('wheel', (event) => {
  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
  }
})

function visibleChange(e) {
  dropdownShow.value = e;
  if (!e) {
    rightClickUser.value.checkedClass = '';
  }
}

function cellClassName({ row }) {
  return row.checkedClass;
}

const handleContextmenu = (row, column, cell, event) => {

  if (row.type === 0 && userStore.user.type !== 0) {
    return
  }

  rightClickUser.value.checkedClass = '';

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault()
  dropdownRef.value?.handleOpen()

  row.checkedClass = 'checked-row';
  rightClickUser.value = row;
}

function deleteAccount(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDeleteAccount(account.accountId).then(() => {
      getAccountList()
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}
function accountCurChange(e) {
  accountParams.num = e
  getAccountList()
}

function resetAccountList() {
  accountList.length = 0
  accountParams.num = 0
  accountParams.size = 10
  accountParams.total = 0
}

function openAccountList(userId) {
  accountParams.userId = userId
  getAccountList(true)
  accountShow.value = true
}

function openDetails(user) {
  userDetails.value = user;
  detailsShow.value = true;
}

function getAccountList(loading = false) {
  accountLoading.value = loading
  userAllAccount(accountParams.userId,accountParams.num, accountParams.size).then(({list,total}) => {
    accountList.length = 0
    accountList.push(...list)
    accountParams.total = total
    accountLoading.value = false
  })
}

function tableFilter(e) {

  if (e.send) filterItem.send = e.send
  if (e.account) filterItem.account = e.account
  if (e.receive) filterItem.receive = e.receive

}

function formatterSend(e) {

  if (filterItem.send.length === 2) {
    return e.sendEmailCount + e.delSendEmailCount
  }

  if (filterItem.send.includes('normal')) {
    return e.sendEmailCount
  }

  if (filterItem.send.includes('del')) {
    return e.delSendEmailCount
  }

  return 0
}

function formatterAccount(e) {

  if (filterItem.account.length === 2) {
    return e.accountCount + e.delAccountCount
  }

  if (filterItem.account.includes('normal')) {
    return e.accountCount
  }

  if (filterItem.account.includes('del')) {
    return e.delAccountCount
  }

  return 0
}

function formatterReceive(e) {


  if (filterItem.receive.length === 2) {
    return e.receiveEmailCount + e.delReceiveEmailCount
  }

  if (filterItem.receive.includes('normal')) {
    return e.receiveEmailCount
  }

  if (filterItem.receive.includes('del')) {
    return e.delReceiveEmailCount
  }

  return 0
}

function setStatusName(user) {
  if (user.isDel === 1) return t('restore')
  if (user.status === 0) return t('btnBan')
  if (user.status === 1) return t('enable')
}

function setRightStatusName(user) {
  if (user.isDel === 1) return t('adminDeleteUser')
  if (user.status === 0) return t('banUser')
  if (user.status === 1) return t('enableUser')
}

const tableRowFormatter = (data) => {
  return data.row.email
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function resetAddForm() {
  addForm.email = ''
  addForm.password = ''
}

function openAdd() {
  showAdd.value = true
}

function submit() {

  if (addLoading.value) return

  if (!addForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.type) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  const form = {...addForm}
  form.email = form.email + form.suffix
  userAdd(form).then(() => {
    addLoading.value = false
    showAdd.value = false
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    getUserList(false)
  }).finally(res => {
    addLoading.value = false
  })
}


function formatSendType(user) {
  if (user.sendAction.sendType === 'day') return t('daily')
  if (user.sendAction.sendType === 'count') return t('total')
  if (user.sendAction.sendType === 'ban') return t('sendBanned')
  if (user.sendAction.sendType === 'internal') return t('sendInternal')
}

function formatSendCount(user) {

  if (!user.sendAction.hasPerm) {
    return t('unauthorized')
  }

  if (!user.sendAction.sendCount) {
    return t('unlimited');
  }

  let count = user.sendCount + '/' + user.sendAction.sendCount

  return count
}

function toRoleName(type) {

  if (type === 0) {
    return t('admin')
  }

  const index = roleList.findIndex(role => role.roleId === type)
  if (index > -1) {
    return roleList[index].name
  }
  return ""
}

function resetSendCount(user) {

  ElMessageBox.confirm(t('reSendConfirm', {msg: user.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userRestSendCount(user.userId).then(() => {
      ElMessage({
        message: t('reSuccessMsg'),
        type: "success",
        plain: true
      })
      user.sendCount = 0
    })
  });
}

function delUser() {
  const rows = tableRef.value?.getSelectionRows?.() || selectedUsers.value;
  const userIds = rows.map(row => row.userId);
  if (userIds.length === 0) {
    return;
  }
  ElMessageBox.confirm(t('delUsersConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete(userIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
      getUserList(false)
    })
  });
}

function delOneUser(user) {
  ElMessageBox.confirm(t('delConfirm', {msg: user.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete([user.userId]).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
      getUserList(false)
    })
  });
}

function restore(user) {

  const type = ref(0)

  ElMessageBox.confirm(null, {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    message: () => h('div', [
      h('div', {class: 'mb-2'}, t('restoreConfirm', {msg: user.email}))
      // h(ElRadioGroup, {
      //   modelValue: type.value,
      //   'onUpdate:modelValue': (val) => (type.value = val),
      // }, [
      //   h(ElRadio, {label: 'option1', value: 0}, t('normalRestore')),
      //   h(ElRadio, {label: 'option2', value: 1}, t('allRestore')),
      // ])
    ]),
    type: 'warning'
  }).then(() => {
    userRestore(user.userId, type.value).then(() => {
      user.isDel = 0
      ElMessage({
        message: t('restoreSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}

function setStatus(user) {
  httpSetStatus(user);
}

function httpSetStatus(user) {
  let status = user.status ? 0 : 1
  userSetStatus({status: status, userId: user.userId}).then(() => {
    user.status = status
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  })
}

function setType() {
  if (settingLoading.value) return
  settingLoading.value = true
  userSetType({type: userForm.type, userId: userForm.userId}).then(() => {
    chooseUser.type = userForm.type
    setTypeShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })

  }).finally(() => {
    settingLoading.value = false
  })
}


function resetUserForm() {
  userForm.password = null
  userForm.userId = 0
}

function handleSelectionChange(rows) {
  selectedUsers.value = Array.isArray(rows) ? rows : []
}

function handleTableSortChange({ prop, order }) {
  tableSortState.prop = order ? (prop || '') : ''
  tableSortState.order = order || ''
}

function selectStatus(status) {
  if (params.status === status) return
  params.status = status
  params.num = 1
  getUserList()
}

function selectTimeSort(timeSort) {
  const hadTableSort = hasTableSort.value
  if (!hadTableSort && params.timeSort === timeSort) return
  tableRef.value?.clearSort?.()
  tableSortState.prop = ''
  tableSortState.order = ''
  params.timeSort = timeSort
  params.num = 1
  getUserList()
}

function search() {
  params.email = (params.email || '').trim()
  params.num = 1
  getUserList()
}

function updatePwd() {

  if (settingLoading.value) return

  if (!userForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (userForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  settingLoading.value = true
  userSetPwd({password: userForm.password, userId: userForm.userId}).then(() => {
    setPwdShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    settingLoading.value = false
  })
}

function openSetType(user) {
  chooseUser = user
  userForm.userId = user.userId
  userForm.type = user.type
  setTypeShow.value = true
}

function openSetPwd(user) {
  userForm.userId = user.userId
  setPwdShow.value = true
}

function refresh() {
  params.email = (params.email || '').trim()
  getUserList();
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
}

function resetFilters() {
  params.email = ''
  params.num = 1
  params.status = -1
  params.timeSort = 0
  tableRef.value?.clearSort?.()
  tableSortState.prop = ''
  tableSortState.order = ''
  getUserList()
}

function numChange(num) {
  params.num = num
  getUserList(false)
}

function sizeChange(size) {
  params.size = size
  getUserList(false)
}

function getUserList(loading = true) {

  tableLoading.value = loading
  const newParams = {
    ...params,
    email: (params.email || '').trim(),
  }

  if (newParams.status === -2) {
    delete newParams.status
    newParams.isDel = 1
  }
  userList(newParams).then(data => {
    selectedUsers.value = []
    users.value = data.list.map(item => ({...item, checkedClass: ''}))
    total.value = data.total
    scrollbarRef.value?.setScrollTop(0);
  }).finally(() => {
    tableLoading.value = false
    setTimeout(() => {
      first.value = false
    }, 200)
  })
}

adjustWidth()

onMounted(() => {
  window.addEventListener('resize', adjustWidth)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', adjustWidth)
})

function adjustWidth() {
  const width = window.innerWidth
  statusShow.value = width > 1090
  createTimeShow.value = width > 1367
  accountNumShow.value = width > 650
  sendNumShow.value = width > 685
  typeShow.value = width > 767
  emailWidth.value = width > 480 ? 230 : null
  settingWidth.value = width < 480 ? (locale.value === 'en' ? 85 : 75) : null
  expandWidth.value = width < 480 ? 30 : 35
  pagerCount.value = width < 768 ? 7 : 11
  receiveWidth.value = width < 480 ? 90 : null
  layout.value = width < 768 ? 'pager' : 'prev, pager, next,sizes, total'
  phonePageShow.value = width < 768
  pageSize.value = width < 380 ? 'small' : ''
}

</script>

<style>
.el-message-box__container {
  align-items: start !important;
}

.el-message-box__message {
  word-break: break-all;
}

.el-table-filter__content {
  min-width: 0;
}
</style>
<style lang="scss" scoped>

:deep(.el-table .checked-row) {
  background: var(--el-color-warning-light-9);
}

.user-box {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.account-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.user-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 15px 9px;
  background: var(--el-bg-color);
  box-shadow: var(--header-actions-border);
  box-sizing: border-box;
  flex-shrink: 0;
}

.toolbar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
}

.toolbar-row-top {
  justify-content: space-between;
}

.toolbar-row-top-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  min-width: 0;
}

.toolbar-row-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.user-count {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.pill-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pill-group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  user-select: none;
}

.segmented-pills {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 2px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
}

.pill-item {
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;

  &:hover:not(.active) {
    color: var(--el-text-color-primary);
  }

  &.active {
    background: var(--el-bg-color);
    color: var(--el-color-primary);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
}

.toolbar-row-bottom {
  gap: 8px;
}

.user-ops-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.tool-icon-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-regular);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }

  &.is-primary:hover:not(:disabled) {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-7);
  }

  &.is-danger:hover:not(:disabled) {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
    border-color: var(--el-color-danger-light-7);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--el-border-color-lighter);
  flex-shrink: 0;
  margin: 0 2px;
}

.search-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
}

.input-prefix-icon {
  color: var(--el-text-color-placeholder);
}

.search-keyword-input {
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 320px;

  :deep(.el-input__wrapper) {
    height: 34px;
    border-radius: 8px;
    box-sizing: border-box;
  }
}

.search-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.search-action-btn {
  height: 34px;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  margin-left: 0 !important;
}

@media (max-width: 767px) {
  .toolbar-row-top {
    gap: 6px;
  }

  .toolbar-row-top-left {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .toolbar-row-top-right {
    width: 100%;
    justify-content: flex-end;
    margin-left: 0;
  }

  .pill-group {
    width: 100%;
  }

  .pill-group-label {
    display: none;
  }

  .segmented-pills {
    display: flex;
    width: 100%;
  }

  .pill-item {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 4px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toolbar-divider {
    display: none;
  }

  .user-ops-group {
    width: 100%;
  }

  .search-controls {
    width: 100%;
  }

  .search-keyword-input {
    flex: 1 1 100%;
    max-width: 100%;
    width: 100%;
  }

  .search-btn-group {
    width: 100%;
  }

  .search-action-btn {
    flex: 1 1 0;
  }
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.type {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.choose-star {
  color: var(--el-color-primary)
}

.scrollbar {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.details {
  padding: 0 10px 10px 10px;
  display: grid;
  gap: 10px;
  .details-item-title {
    white-space: pre;
    color: #909399;
    font-weight: bold;
    padding-right: 10px;
  }
}

.oauth-details {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

:deep(.oauth-avatar) {
  flex-shrink: 0;
}

:deep(.oauth-platform-icon) {
  flex-shrink: 0;
}

.account-pagination {
  display: flex;
  justify-content: end;
  width: 100%;
}

.pagination {
  margin-top: 15px;
  margin-bottom: 20px;
  padding-right: 30px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 10px;
  @media (max-width: 767px) {
    padding-right: 10px;
  }

  .el-pagination {
    align-self: end;
  }
}


.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog {
  .dialog-box {
    .el-button {
      width: 100%;
      margin-top: 15px;
    }
  }
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

.loading {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--loadding-background);
  left: 0;
  z-index: 2;
  top: 0;
  width: 100%;
  height: 100%;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

.setting-icon {
  position: relative;
  top: 6px;
}

.right-dropdown-item {
  display: flex;
  gap: 10px;
}

.btn {
  width: 100%;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--el-bg-color);
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--el-bg-color);
}

:deep(.cell) {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

:deep(.receive .cell) {
  white-space: nowrap;
}

:deep(.send .cell) {
  white-space: nowrap;
}

:deep(.account .cell) {
  white-space: nowrap;
}

:deep(.el-table) {
  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
}

:deep(.el-table th.el-table__cell>.cell.highlight) {
  color: #909399;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

:deep(.el-message-box__container) {
  align-items: start;
}
</style>
