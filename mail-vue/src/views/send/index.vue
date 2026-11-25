<template>
  <emailScroll ref="sendScroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               show-status
               actionLeft="4px"
               :star-cancel="starCancel"
               :highlight-text="sendStore.searchParams.text"
               :search-store="sendStore"
               :search-options="searchOptions"
               @jump="jumpContent"
               :type="'send'"
  >
  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSendStore} from "@/store/send.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {computed, defineOptions, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import router from "@/router/index.js";

defineOptions({
  name: 'send'
})

const {t} = useI18n();
const emailStore = useEmailStore();
const sendStore = useSendStore();
const accountStore = useAccountStore();
const sendScroll = ref({})

const searchOptions = computed(() => [
  {label: t('subject'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('searchRecipientAddress'), type: 'recipientAddress'},
])
onMounted(() => {
  emailStore.sendScroll = sendScroll;
})

watch(() => accountStore.currentAccountId, () => {
  sendScroll.value.refreshList();
})

watch(
  () => sendStore.searchParams,
  () => {
    sendScroll.value.refreshList()
  },
  {deep: true}
)

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push({name: 'content', params: {mailbox: 'sent'}})
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, 0, size, 1, full, sendStore.searchParams)
  ).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

</script>

<style scoped>
.icon {
  cursor: pointer;
}
</style>
